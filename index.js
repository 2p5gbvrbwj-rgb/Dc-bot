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
} from "discord.js";

const TOKEN = process.env.DISCORD_BOT_TOKEN;
const VOUCH_CHANNEL_ID = process.env.VOUCH_CHANNEL_ID;

const LIGHT_BLUE = 0x5dade2;
const OWNER_ID = "1481415545256546444";

// ================= PANEL SETTINGS =================

const panelSettings = {
  title: "🎫 Support Tickets",
  text:
    "Click the button below to open a support ticket.\nOur team will assist you as soon as possible.",
  categoryId: null,
  buttonText: "Open Ticket",
  buttonEmoji: "📩",
};

// ================= HELPERS =================

function log(...args) {
  console.log(...args);
}

function error(...args) {
  console.error(...args);
}

function getStars(rating) {
  return "★".repeat(rating) + "☆".repeat(10 - rating);
}

// ================= OWNER CHECK =================

async function isOwner(interaction) {
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

function getOpenTicketCount(guild) {
  return guild.channels.cache.filter(
    (ch) =>
      ch.type === ChannelType.GuildText &&
      ch.name.startsWith("ticket-"),
  ).size;
}

function buildTicketsEmbed(guild) {
  const open = getOpenTicketCount(guild);

  return new EmbedBuilder()
    .setColor(LIGHT_BLUE)
    .setTitle("🎫 Ticket Statistics")
    .addFields({
      name: "🟢 Open Tickets",
      value: `\`${open}\``,
      inline: true,
    })
    .setFooter({
      text: "Last updated",
    })
    .setTimestamp();
}

function buildTicketsRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("refresh_tickets")
      .setLabel("Refresh")
      .setEmoji("🔄")
      .setStyle(ButtonStyle.Primary),
  );
}

// ================= COMMANDS =================

const vouchCommand = new SlashCommandBuilder()
  .setName("vouch")
  .setDescription("Leave a vouch")
  .addStringOption((opt) =>
    opt
      .setName("comment")
      .setDescription("Product purchased")
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
      .setDescription("Payment method")
      .setRequired(true),
  );

const embedCommand = new SlashCommandBuilder()
  .setName("embed")
  .setDescription("Send an embed")
  .addChannelOption((opt) =>
    opt
      .setName("channel")
      .setDescription("Channel")
      .setRequired(true),
  )
  .addStringOption((opt) =>
    opt
      .setName("text")
      .setDescription("Embed text")
      .setRequired(true),
  )
  .addStringOption((opt) =>
    opt
      .setName("title")
      .setDescription("Optional title"),
  );

const panelCommand = new SlashCommandBuilder()
  .setName("panel")
  .setDescription("Send ticket panel");

const ticketsCommand = new SlashCommandBuilder()
  .setName("tickets")
  .setDescription("View open tickets");

const ticketCategoryCommand = new SlashCommandBuilder()
  .setName("ticketcategory")
  .setDescription("Set ticket category")
  .addChannelOption((opt) =>
    opt
      .setName("category")
      .setDescription("Category")
      .addChannelTypes(ChannelType.GuildCategory)
      .setRequired(true),
  );

const panelTextCommand = new SlashCommandBuilder()
  .setName("paneltext")
  .setDescription("Change panel title and text")
  .addStringOption((opt) =>
    opt
      .setName("title")
      .setDescription("New panel title")
      .setRequired(true),
  )
  .addStringOption((opt) =>
    opt
      .setName("text")
      .setDescription("New panel text")
      .setRequired(true),
  );

const panelButtonCommand = new SlashCommandBuilder()
  .setName("panelbutton")
  .setDescription("Edit panel button")
  .addStringOption((opt) =>
    opt
      .setName("text")
      .setDescription("Button text")
      .setRequired(true),
  )
  .addStringOption((opt) =>
    opt
      .setName("emoji")
      .setDescription("Button emoji")
      .setRequired(true),
  );

// ================= BOT =================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
  ],
});

client.once("ready", async () => {
  log(`Logged in as ${client.user.tag}`);

  const rest = new REST({ version: "10" }).setToken(TOKEN);

  try {
    await rest.put(
      Routes.applicationCommands(client.user.id),
      {
        body: [
          vouchCommand.toJSON(),
          embedCommand.toJSON(),
          panelCommand.toJSON(),
          ticketsCommand.toJSON(),
          ticketCategoryCommand.toJSON(),
          panelTextCommand.toJSON(),
          panelButtonCommand.toJSON(),
        ],
      },
    );

    log("Commands registered");
  } catch (err) {
    error(err);
  }
});

// ================= INTERACTIONS =================

client.on("interactionCreate", async (interaction) => {
  try {

    // ================= SLASH COMMANDS =================

    if (interaction.isChatInputCommand()) {

      // ===== VOUCH =====

      if (interaction.commandName === "vouch") {

        const product = interaction.options.getString("comment");
        const rating = interaction.options.getInteger("rating");
        const payment = interaction.options.getString("payment");

        const embed = new EmbedBuilder()
          .setColor(LIGHT_BLUE)
          .setAuthor({
            name: `${interaction.user.username}\n(${interaction.user.id})`,
            iconURL: interaction.user.displayAvatarURL({
              extension: "png",
              size: 1024,
            }),
          })
          .setThumbnail(
            interaction.user.displayAvatarURL({
              extension: "png",
              size: 1024,
            }),
          )
          .addFields(
            {
              name: "Rating",
              value: `${getStars(rating)} (${rating}/10)`,
            },
            {
              name: "Payment",
              value: payment,
            },
            {
              name: "Product Purchased",
              value: product,
            },
          )
          .setFooter({
            text: `New Vouch | ${new Date().toLocaleString()}`,
          });

        const channel = await client.channels.fetch(VOUCH_CHANNEL_ID);

        if (channel) {
          await channel.send({
            embeds: [embed],
          });
        }

        await interaction.reply({
          content: "✅ Vouch sent!",
          ephemeral: true,
        });
      }

      // ===== EMBED =====

      if (interaction.commandName === "embed") {

        if (!(await isOwner(interaction))) {
          return interaction.reply({
            content: "❌ No permission.",
            ephemeral: true,
          });
        }

        const channel = interaction.options.getChannel("channel");
        const text = interaction.options.getString("text");
        const title = interaction.options.getString("title");

        const embed = new EmbedBuilder()
          .setColor(LIGHT_BLUE)
          .setDescription(text);

        if (title) {
          embed.setTitle(title);
        }

        await channel.send({
          embeds: [embed],
        });

        await interaction.reply({
          content: "✅ Embed sent!",
          ephemeral: true,
        });
      }

      // ===== PANEL =====

      if (interaction.commandName === "panel") {

        if (!(await isOwner(interaction))) {
          return interaction.reply({
            content: "❌ No permission.",
            ephemeral: true,
          });
        }

        const embed = new EmbedBuilder()
          .setColor(LIGHT_BLUE)
          .setTitle(panelSettings.title)
          .setDescription(panelSettings.text);

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("open_ticket")
            .setLabel(panelSettings.buttonText)
            .setEmoji(panelSettings.buttonEmoji)
            .setStyle(ButtonStyle.Primary),
        );

        await interaction.channel.send({
          embeds: [embed],
          components: [row],
        });

        await interaction.reply({
          content: "✅ Panel sent!",
          ephemeral: true,
        });
      }

      // ===== TICKETS =====

      if (interaction.commandName === "tickets") {

        const embed = buildTicketsEmbed(interaction.guild);
        const row = buildTicketsRow();

        await interaction.reply({
          embeds: [embed],
          components: [row],
        });
      }

      // ===== TICKET CATEGORY =====

      if (interaction.commandName === "ticketcategory") {

        if (!(await isOwner(interaction))) {
          return interaction.reply({
            content: "❌ No permission.",
            ephemeral: true,
          });
        }

        const category = interaction.options.getChannel("category");

        panelSettings.categoryId = category.id;

        await interaction.reply({
          content: `✅ Ticket category set to ${category.name}`,
          ephemeral: true,
        });
      }

      // ===== PANEL TEXT =====

      if (interaction.commandName === "paneltext") {

        if (!(await isOwner(interaction))) {
          return interaction.reply({
            content: "❌ No permission.",
            ephemeral: true,
          });
        }

        const title = interaction.options.getString("title");
        const text = interaction.options.getString("text");

        panelSettings.title = title;
        panelSettings.text = text;

        await interaction.reply({
          content: "✅ Panel title and text updated!",
          ephemeral: true,
        });
      }

      // ===== PANEL BUTTON =====

      if (interaction.commandName === "panelbutton") {

        if (!(await isOwner(interaction))) {
          return interaction.reply({
            content: "❌ No permission.",
            ephemeral: true,
          });
        }

        const text = interaction.options.getString("text");
        const emoji = interaction.options.getString("emoji");

        panelSettings.buttonText = text;
        panelSettings.buttonEmoji = emoji;

        await interaction.reply({
          content: "✅ Panel button updated!",
          ephemeral: true,
        });
      }
    }

    // ================= BUTTONS =================

    if (interaction.isButton()) {

      // ===== OPEN TICKET =====

      if (interaction.customId === "open_ticket") {

        const guild = interaction.guild;
        const user = interaction.user;

        const existing = guild.channels.cache.find(
          (ch) =>
            ch.type === ChannelType.GuildText &&
            ch.name === `ticket-${user.username.toLowerCase()}`
        );

        if (existing) {
          return interaction.reply({
            content: `❌ You already have a ticket: <#${existing.id}>`,
            ephemeral: true,
          });
        }

        const channel = await guild.channels.create({
          name: `ticket-${user.username.toLowerCase()}`,
          type: ChannelType.GuildText,
          parent: panelSettings.categoryId || undefined,
          permissionOverwrites: [
            {
              id: guild.roles.everyone.id,
              deny: [PermissionFlagsBits.ViewChannel],
            },
            {
              id: user.id,
              allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
              ],
            },
          ],
        });

        const embed = new EmbedBuilder()
          .setColor(LIGHT_BLUE)
          .setTitle("welcome to your ticket")
          .setDescription(
            `Hello <@${user.id}> 👋\n\nThank you for creating a ticket at our shop!\nA staff member will be with you shortly.\n\nPlease say what you wsnt to purchase or what you need help with!.`,
          )
          .setFooter({
            text: "Staff Team",
          })
          .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("close_ticket")
            .setLabel("Close Ticket")
            .setEmoji("🔒")
            .setStyle(ButtonStyle.Danger),
        );

        await channel.send({
          embeds: [embed],
          components: [row],
        });

        await interaction.reply({
          content: `✅ Ticket created: <#${channel.id}>`,
          ephemeral: true,
        });
      }

      // ===== CLOSE TICKET =====

      if (interaction.customId === "close_ticket") {

        const channel = interaction.channel;

        await interaction.reply({
          content: "🔒 Closing ticket...",
        });

        try {
          await channel.delete();
        } catch (err) {
          error(err);
        }
      }

      // ===== REFRESH =====

      if (interaction.customId === "refresh_tickets") {

        const embed = buildTicketsEmbed(interaction.guild);
        const row = buildTicketsRow();

        await interaction.update({
          embeds: [embed],
          components: [row],
        });
      }
    }

  } catch (err) {
    error(err);
  }
});

client.login(TOKEN);
