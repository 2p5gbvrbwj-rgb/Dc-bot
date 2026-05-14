import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder,
  ChannelType,
  PermissionFlagsBits,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  type ChatInputCommandInteraction,
  type ButtonInteraction,
  type TextChannel,
} from "discord.js";
import { logger } from "./lib/logger.js";

const TOKEN = process.env["DISCORD_BOT_TOKEN"];
const VOUCH_CHANNEL_ID = process.env["VOUCH_CHANNEL_ID"];

const LIGHT_BLUE = 0x5dade2;
const OWNER_ID = "1481415545256546444";

// ================= PANEL SETTINGS =================

interface PanelSettings {
  text: string;
  imageUrl: string | null;
  categoryId: string | null;
}

const panelSettings: PanelSettings = {
  text: "Click the button below to open a support ticket.\nOur team will assist you as soon as possible.",
  imageUrl: null,
  categoryId: null,
};

// ================= OWNER CHECK =================

async function isOwner(
  interaction: ChatInputCommandInteraction | ButtonInteraction,
): Promise<boolean> {
  if (interaction.user.id === OWNER_ID) return true;

  const guild = interaction.guild;
  if (!guild) return false;

  let member = guild.members.cache.get(interaction.user.id);
  if (!member) {
    try {
      member = await guild.members.fetch(interaction.user.id);
    } catch {
      return false;
    }
  }

  return member.roles.cache.some(
    (role) => role.name.toLowerCase() === "owner",
  );
}

// ================= TICKET HELPERS =================

function getOpenTicketCount(guild: NonNullable<ChatInputCommandInteraction["guild"] | ButtonInteraction["guild"]>): number {
  return guild.channels.cache.filter(
    (ch) =>
      ch.type === ChannelType.GuildText &&
      ch.name.startsWith("ticket-"),
  ).size;
}

function getClosedTicketCount(guild: NonNullable<ChatInputCommandInteraction["guild"] | ButtonInteraction["guild"]>): number {
  return guild.channels.cache.filter(
    (ch) =>
      ch.type === ChannelType.GuildText &&
      ch.name.startsWith("closed-"),
  ).size;
}

function buildTicketsEmbed(
  guild: NonNullable<ChatInputCommandInteraction["guild"] | ButtonInteraction["guild"]>,
): EmbedBuilder {
  const open = getOpenTicketCount(guild);
  const closed = getClosedTicketCount(guild);

  return new EmbedBuilder()
    .setColor(LIGHT_BLUE)
    .setTitle("🎫 Ticket Statistics")
    .addFields(
      { name: "🟢 Open Tickets", value: `\`${open}\``, inline: true },
      { name: "🔴 Closed Tickets", value: `\`${closed}\``, inline: true },
      { name: "📊 Total", value: `\`${open + closed}\``, inline: true },
    )
    .setFooter({ text: "Last updated" })
    .setTimestamp();
}

function buildTicketsRow(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("refresh_tickets")
      .setLabel("🔄 Refresh")
      .setStyle(ButtonStyle.Primary),
  );
}

// ================= STARS HELPER =================

function getStars(rating: number): string {
  return "★".repeat(rating) + "☆".repeat(10 - rating);
}

// ================= COMMANDS =================

const vouchCommand = new SlashCommandBuilder()
  .setName("vouch")
  .setDescription("Leave a vouch for a purchase")
  .addStringOption((opt) =>
    opt
      .setName("comment")
      .setDescription("What product did you purchase?")
      .setRequired(true),
  )
  .addIntegerOption((opt) =>
    opt
      .setName("rating")
      .setDescription("Rating out of 10")
      .setRequired(true)
      .setMinValue(1)
      .setMaxValue(10),
  )
  .addStringOption((opt) =>
    opt
      .setName("payment")
      .setDescription("Payment method used")
      .setRequired(true),
  );

const embedCommand = new SlashCommandBuilder()
  .setName("embed")
  .setDescription("Send a custom embed (owner only)")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addChannelOption((opt) =>
    opt
      .setName("channel")
      .setDescription("Channel")
      .setRequired(true)
      .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
  )
  .addStringOption((opt) =>
    opt.setName("text").setDescription("Embed text").setRequired(true),
  )
  .addStringOption((opt) =>
    opt
      .setName("title")
      .setDescription("Optional title")
      .setRequired(false),
  );

const massDmCommand = new SlashCommandBuilder()
  .setName("massdm")
  .setDescription("DM everyone (owner only)")
  .addStringOption((opt) =>
    opt.setName("message").setDescription("Message").setRequired(true),
  );

const panelCommand = new SlashCommandBuilder()
  .setName("panel")
  .setDescription("Send the ticket panel to this channel (owner only)");

const panelImageCommand = new SlashCommandBuilder()
  .setName("panelimage")
  .setDescription("Set the image shown inside the ticket panel embed (owner only)")
  .addStringOption((opt) =>
    opt
      .setName("url")
      .setDescription("Direct image URL (leave blank to remove image)")
      .setRequired(false),
  );

const panelTextCommand = new SlashCommandBuilder()
  .setName("paneltext")
  .setDescription("Change the text shown in the ticket panel (owner only)")
  .addStringOption((opt) =>
    opt
      .setName("text")
      .setDescription("New panel description text")
      .setRequired(true),
  );

const ticketCategoryCommand = new SlashCommandBuilder()
  .setName("ticketcategory")
  .setDescription("Set the category where new ticket channels are created (owner only)")
  .addChannelOption((opt) =>
    opt
      .setName("category")
      .setDescription("Category channel")
      .setRequired(true)
      .addChannelTypes(ChannelType.GuildCategory),
  );

const ticketsCommand = new SlashCommandBuilder()
  .setName("tickets")
  .setDescription("View open and closed ticket counts (owner only)");

// ================= HANDLERS =================

async function handleVouch(
  interaction: ChatInputCommandInteraction,
  client: Client,
): Promise<void> {
  const product = interaction.options.getString("comment")!;
  const rating = interaction.options.getInteger("rating")!;
  const payment = interaction.options.getString("payment")!;
  const user = interaction.user;

  const embed = new EmbedBuilder()
    .setColor(LIGHT_BLUE)
    .setAuthor({
      name: `${user.tag} (${user.id})`,
      iconURL: user.displayAvatarURL({ extension: "png" }),
    })
    .setThumbnail(user.displayAvatarURL({ extension: "png" }))
    .addFields(
      { name: "Rating", value: `${getStars(rating)} (${rating}/10)`, inline: false },
      { name: "Payment", value: payment, inline: false },
      { name: "Product Purchased", value: product, inline: false },
    )
    .setFooter({ text: "New Vouch" })
    .setTimestamp();

  try {
    if (!VOUCH_CHANNEL_ID) throw new Error("VOUCH_CHANNEL_ID not set");
    const channel = await client.channels.fetch(VOUCH_CHANNEL_ID);
    if (!channel || !channel.isSendable()) return;
    await channel.send({ embeds: [embed] });
    await interaction.reply({ content: "✅ Vouch sent!", ephemeral: true });
  } catch (err) {
    logger.error({ err }, "handleVouch error");
    await interaction.reply({ content: "❌ Error sending vouch.", ephemeral: true });
  }
}

async function handleEmbed(
  interaction: ChatInputCommandInteraction,
  client: Client,
): Promise<void> {
  if (!(await isOwner(interaction))) {
    await interaction.reply({ content: "❌ You do not have permission to use this command.", ephemeral: true });
    return;
  }

  const targetChannel = interaction.options.getChannel("channel")!;
  const text = interaction.options.getString("text")!;
  const title = interaction.options.getString("title");

  const embed = new EmbedBuilder().setColor(LIGHT_BLUE).setDescription(text);
  if (title) embed.setTitle(title);

  try {
    const channel = await client.channels.fetch(targetChannel.id);
    if (!channel || !channel.isSendable()) return;
    await channel.send({ embeds: [embed] });
    await interaction.reply({ content: "✅ Embed sent!", ephemeral: true });
  } catch (err) {
    logger.error({ err }, "handleEmbed error");
    await interaction.reply({ content: "❌ Error sending embed.", ephemeral: true });
  }
}

async function handleMassDm(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  if (!(await isOwner(interaction))) {
    await interaction.reply({ content: "❌ You do not have permission to use this command.", ephemeral: true });
    return;
  }

  const message = interaction.options.getString("message")!;
  const members = await interaction.guild!.members.fetch();
  let sent = 0;

  for (const member of members.values()) {
    if (member.user.bot) continue;
    try {
      await member.send(message);
      sent++;
    } catch {
      // ignore DM failures
    }
  }

  await interaction.reply({ content: `✅ Sent to **${sent}** users.`, ephemeral: true });
}

async function handlePanel(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  if (!(await isOwner(interaction))) {
    await interaction.reply({ content: "❌ You do not have permission to use this command.", ephemeral: true });
    return;
  }

  const embed = new EmbedBuilder()
    .setColor(LIGHT_BLUE)
    .setTitle("🎫 Support Tickets")
    .setDescription(panelSettings.text)
    .setFooter({ text: "Click the button below to get started" });

  if (panelSettings.imageUrl) {
    embed.setImage(panelSettings.imageUrl);
  }

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("open_ticket")
      .setLabel("📩 Open a Ticket")
      .setStyle(ButtonStyle.Primary),
  );

  await interaction.reply({ content: "✅ Panel sent!", ephemeral: true });
  await (interaction.channel as TextChannel).send({ embeds: [embed], components: [row] });
}

async function handlePanelImage(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  if (!(await isOwner(interaction))) {
    await interaction.reply({ content: "❌ You do not have permission to use this command.", ephemeral: true });
    return;
  }

  const url = interaction.options.getString("url");
  panelSettings.imageUrl = url ?? null;

  if (url) {
    await interaction.reply({ content: `✅ Panel image set to: ${url}`, ephemeral: true });
  } else {
    await interaction.reply({ content: "✅ Panel image removed.", ephemeral: true });
  }
}

async function handlePanelText(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  if (!(await isOwner(interaction))) {
    await interaction.reply({ content: "❌ You do not have permission to use this command.", ephemeral: true });
    return;
  }

  const text = interaction.options.getString("text")!;
  panelSettings.text = text;

  await interaction.reply({ content: `✅ Panel text updated:\n> ${text}`, ephemeral: true });
}

async function handleTicketCategory(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  if (!(await isOwner(interaction))) {
    await interaction.reply({ content: "❌ You do not have permission to use this command.", ephemeral: true });
    return;
  }

  const category = interaction.options.getChannel("category")!;
  panelSettings.categoryId = category.id;

  await interaction.reply({
    content: `✅ Ticket category set to **${category.name}**.`,
    ephemeral: true,
  });
}

async function handleTicketsCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  if (!(await isOwner(interaction))) {
    await interaction.reply({ content: "❌ You do not have permission to use this command.", ephemeral: true });
    return;
  }

  const guild = interaction.guild!;
  const embed = buildTicketsEmbed(guild);
  const row = buildTicketsRow();

  await interaction.reply({ embeds: [embed], components: [row] });
}

// ================= BUTTON HANDLERS =================

async function handleOpenTicket(interaction: ButtonInteraction): Promise<void> {
  const guild = interaction.guild!;
  const user = interaction.user;

  const existingTicket = guild.channels.cache.find(
    (ch) =>
      ch.type === ChannelType.GuildText &&
      ch.name === `ticket-${user.username.toLowerCase().replace(/[^a-z0-9]/g, "")}`,
  );

  if (existingTicket) {
    await interaction.reply({
      content: `❌ You already have an open ticket: <#${existingTicket.id}>`,
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    const channelName = `ticket-${user.username.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 20)}`;

    const ticketChannel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: panelSettings.categoryId ?? undefined,
      permissionOverwrites: [
        {
          id: guild.roles.everyone,
          deny: [PermissionFlagsBits.ViewChannel],
        },
        {
          id: user.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
          ],
        },
      ],
    });

    const ticketEmbed = new EmbedBuilder()
      .setColor(LIGHT_BLUE)
      .setTitle("🎫 New Ticket")
      .setDescription(
        `Hello <@${user.id}>, welcome to your ticket!\n\nPlease describe your issue and a staff member will be with you shortly.`,
      )
      .addFields(
        { name: "Created By", value: `<@${user.id}> (${user.tag})`, inline: true },
        { name: "Status", value: "🟢 Open", inline: true },
      )
      .setThumbnail(user.displayAvatarURL({ extension: "png" }))
      .setFooter({ text: `Ticket ID: ${ticketChannel.id}` })
      .setTimestamp();

    const ticketRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("claim_ticket")
        .setLabel("🙋 Claim")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId("close_ticket")
        .setLabel("🔒 Close")
        .setStyle(ButtonStyle.Danger),
    );

    await ticketChannel.send({ embeds: [ticketEmbed], components: [ticketRow] });

    await interaction.editReply({
      content: `✅ Your ticket has been created: <#${ticketChannel.id}>`,
    });
  } catch (err) {
    logger.error({ err }, "handleOpenTicket error");
    await interaction.editReply({ content: "❌ Failed to create ticket. Please try again." });
  }
}

async function handleClaimTicket(interaction: ButtonInteraction): Promise<void> {
  const claimEmbed = new EmbedBuilder()
    .setColor(LIGHT_BLUE)
    .setDescription(`✅ This ticket has been claimed by <@${interaction.user.id}>.`);

  await interaction.reply({ embeds: [claimEmbed] });
}

async function handleCloseTicket(interaction: ButtonInteraction): Promise<void> {
  const channel = interaction.channel as TextChannel;

  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(LIGHT_BLUE)
        .setTitle("🔒 Ticket Closing")
        .setDescription(`This ticket is being closed by <@${interaction.user.id}>.\nThe channel will be archived momentarily.`),
    ],
  });

  try {
    const newName = channel.name.replace(/^ticket-/, "closed-");
    await channel.setName(newName);
    await channel.permissionOverwrites.set([
      {
        id: channel.guild.roles.everyone,
        deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
      },
    ]);
  } catch (err) {
    logger.error({ err }, "handleCloseTicket error");
  }
}

async function handleRefreshTickets(
  interaction: ButtonInteraction,
): Promise<void> {
  if (!(await isOwner(interaction))) {
    await interaction.reply({ content: "❌ You do not have permission to use this button.", ephemeral: true });
    return;
  }

  const guild = interaction.guild!;
  const embed = buildTicketsEmbed(guild);
  const row = buildTicketsRow();

  await interaction.update({ embeds: [embed], components: [row] });
}

// ================= BOT STARTUP =================

export async function startBot(): Promise<void> {
  if (!TOKEN) {
    logger.warn("DISCORD_BOT_TOKEN not set — bot will not start.");
    return;
  }

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
    ],
  });

  client.once("ready", async () => {
    logger.info({ tag: client.user?.tag }, "Discord bot logged in");

    const rest = new REST().setToken(TOKEN);

    await rest.put(Routes.applicationCommands(client.user!.id), {
      body: [
        vouchCommand.toJSON(),
        embedCommand.toJSON(),
        massDmCommand.toJSON(),
        panelCommand.toJSON(),
        panelImageCommand.toJSON(),
        panelTextCommand.toJSON(),
        ticketCategoryCommand.toJSON(),
        ticketsCommand.toJSON(),
      ],
    });

    logger.info("Discord slash commands registered");
  });

  client.on("interactionCreate", async (interaction) => {
    try {
      if (interaction.isChatInputCommand()) {
        switch (interaction.commandName) {
          case "vouch":
            await handleVouch(interaction, client);
            break;
          case "embed":
            await handleEmbed(interaction, client);
            break;
          case "massdm":
            await handleMassDm(interaction);
            break;
          case "panel":
            await handlePanel(interaction);
            break;
          case "panelimage":
            await handlePanelImage(interaction);
            break;
          case "paneltext":
            await handlePanelText(interaction);
            break;
          case "ticketcategory":
            await handleTicketCategory(interaction);
            break;
          case "tickets":
            await handleTicketsCommand(interaction);
            break;
        }
      } else if (interaction.isButton()) {
        switch (interaction.customId) {
          case "open_ticket":
            await handleOpenTicket(interaction);
            break;
          case "claim_ticket":
            await handleClaimTicket(interaction);
            break;
          case "close_ticket":
            await handleCloseTicket(interaction);
            break;
          case "refresh_tickets":
            await handleRefreshTickets(interaction);
            break;
        }
      }
    } catch (err) {
      logger.error({ err }, "Unhandled interaction error");
    }
  });

  await client.login(TOKEN);
}
