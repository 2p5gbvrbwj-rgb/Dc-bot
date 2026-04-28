import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder,
  ChatInputCommandInteraction,
  ChannelType,
  PermissionFlagsBits,
} from "discord.js";
import { logger } from "./lib/logger";

const TOKEN = process.env["DISCORD_BOT_TOKEN"];
const VOUCH_CHANNEL_ID = process.env["VOUCH_CHANNEL_ID"];

if (!TOKEN) {
  throw new Error("DISCORD_BOT_TOKEN environment variable is required.");
}
if (!VOUCH_CHANNEL_ID) {
  throw new Error("VOUCH_CHANNEL_ID environment variable is required.");
}

const LIGHT_BLUE = 0x5dade2;
const OWNER_ID = "1481415545256546444";

const vouchCommand = new SlashCommandBuilder()
  .setName("vouch")
  .setDescription("Leave a vouch for a purchase")
  .addStringOption((opt) =>
    opt
      .setName("comment")
      .setDescription("What product did you purchase?")
      .setRequired(true)
      .setMaxLength(500),
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
      .setDescription("Payment method used (e.g. PayPal, Crypto, CashApp)")
      .setRequired(true)
      .setMaxLength(100),
  );

const embedCommand = new SlashCommandBuilder()
  .setName("embed")
  .setDescription("Send a custom embed to any channel")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addChannelOption((opt) =>
    opt
      .setName("channel")
      .setDescription("Channel to send the embed to")
      .setRequired(true)
      .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
  )
  .addStringOption((opt) =>
    opt
      .setName("text")
      .setDescription("The message to display in the embed")
      .setRequired(true)
      .setMaxLength(2000),
  )
  .addStringOption((opt) =>
    opt
      .setName("title")
      .setDescription("Optional title for the embed")
      .setRequired(false)
      .setMaxLength(256),
  );

const massDmCommand = new SlashCommandBuilder()
  .setName("massdm")
  .setDescription("DM every member in the server (owner only)")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addStringOption((opt) =>
    opt
      .setName("message")
      .setDescription("Message to send to every member")
      .setRequired(true)
      .setMaxLength(1900),
  );

function getStars(rating: number): string {
  const filled = "★".repeat(rating);
  const empty = "☆".repeat(10 - rating);
  return filled + empty;
}

async function handleVouch(
  interaction: ChatInputCommandInteraction,
  client: Client,
) {
  const comment = interaction.options.getString("comment", true);
  const rating = interaction.options.getInteger("rating", true);
  const payment = interaction.options.getString("payment", true);
  const user = interaction.user;

  if (!interaction.guild) {
    await interaction.reply({
      content: "This command can only be used in a server.",
      ephemeral: true,
    });
    return;
  }

  const nowUnix = Math.floor(Date.now() / 1000);

  const embed = new EmbedBuilder()
    .setColor(LIGHT_BLUE)
    .setTitle("New Vouch Received")
    .setThumbnail(user.displayAvatarURL({ size: 256 }))
    .addFields(
      {
        name: "From",
        value: `<@${user.id}>\n(${user.id})`,
        inline: false,
      },
      {
        name: "Rating",
        value: `${getStars(rating)} (${rating}/10)`,
        inline: false,
      },
      {
        name: "Payment Method",
        value: payment,
        inline: false,
      },
      {
        name: "Vouched at",
        value: `<t:${nowUnix}:F>`,
        inline: false,
      },
      {
        name: "Product you purchased",
        value: comment,
        inline: false,
      },
    )
    .setFooter({ text: "Thanks for purchasing our product!" });

  try {
    const channel = await client.channels.fetch(VOUCH_CHANNEL_ID!);
    if (!channel || !channel.isSendable()) {
      logger.error(
        { channelId: VOUCH_CHANNEL_ID, channelType: channel?.type },
        "Vouch channel not found or not sendable",
      );
      await interaction.reply({
        content:
          "Could not find the vouch channel. Make sure the bot has access to it.",
        ephemeral: true,
      });
      return;
    }

    await channel.send({ embeds: [embed] });

    await interaction.reply({
      content: `Your vouch has been submitted to <#${VOUCH_CHANNEL_ID}>!`,
      ephemeral: true,
    });
  } catch (err) {
    logger.error({ err }, "Failed to send vouch embed");
    await interaction.reply({
      content:
        "Something went wrong sending your vouch. Make sure the bot has permission to send messages in the vouch channel.",
      ephemeral: true,
    });
  }
}

async function handleEmbed(
  interaction: ChatInputCommandInteraction,
  client: Client,
) {
  const targetChannel = interaction.options.getChannel("channel", true);
  const text = interaction.options.getString("text", true);
  const title = interaction.options.getString("title");

  if (!interaction.guild) {
    await interaction.reply({
      content: "This command can only be used in a server.",
      ephemeral: true,
    });
    return;
  }

  if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({
      content: "You need Administrator permission to use this command.",
      ephemeral: true,
    });
    return;
  }

  const embed = new EmbedBuilder().setColor(LIGHT_BLUE).setDescription(text);

  if (title) {
    embed.setTitle(title);
  }

  try {
    const channel = await client.channels.fetch(targetChannel.id);
    if (!channel || !channel.isSendable()) {
      await interaction.reply({
        content: "That channel isn't available or the bot can't send messages there.",
        ephemeral: true,
      });
      return;
    }

    await channel.send({ embeds: [embed] });

    await interaction.reply({
      content: `Embed sent to <#${targetChannel.id}>!`,
      ephemeral: true,
    });
  } catch (err) {
    logger.error({ err }, "Failed to send custom embed");
    await interaction.reply({
      content:
        "Something went wrong. Make sure the bot has permission to send messages in that channel.",
      ephemeral: true,
    });
  }
}

async function handleMassDm(
  interaction: ChatInputCommandInteraction,
) {
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({
      content: "This command can only be used in a server.",
      ephemeral: true,
    });
    return;
  }

  if (interaction.user.id !== OWNER_ID) {
    await interaction.reply({
      content: "Only the server owner can use this command.",
      ephemeral: true,
    });
    return;
  }

  const message = interaction.options.getString("message", true);

  await interaction.deferReply({ ephemeral: true });

  try {
    const members = await guild.members.fetch();
    const humans = members.filter((m) => !m.user.bot);

    let sent = 0;
    let failed = 0;

    const memberList = [...humans.values()];
    const BATCH_SIZE = 20;

    for (let i = 0; i < memberList.length; i += BATCH_SIZE) {
      const batch = memberList.slice(i, i + BATCH_SIZE);

      const results = await Promise.allSettled(
        batch.map((member) => {
          const dmEmbed = new EmbedBuilder()
            .setColor(LIGHT_BLUE)
            .setDescription(message);
          return member.send({ embeds: [dmEmbed] });
        }),
      );

      for (const result of results) {
        if (result.status === "fulfilled") sent++;
        else failed++;
      }

      if (i + BATCH_SIZE < memberList.length) {
        await new Promise((res) => setTimeout(res, 500));
      }
    }

    await interaction.editReply({
      content: `Mass DM complete.\n✅ Sent: **${sent}**\n❌ Failed (DMs closed): **${failed}**`,
    });
  } catch (err) {
    logger.error({ err }, "Mass DM failed");
    await interaction.editReply({
      content:
        "Failed to fetch members. Make sure the **Server Members Intent** is enabled in the Discord Developer Portal.",
    });
  }
}

async function registerCommands(clientId: string) {
  const rest = new REST().setToken(TOKEN!);
  try {
    logger.info("Registering slash commands...");
    await rest.put(Routes.applicationCommands(clientId), {
      body: [vouchCommand.toJSON(), embedCommand.toJSON(), massDmCommand.toJSON()],
    });
    logger.info("Slash commands registered successfully.");
  } catch (err) {
    logger.error({ err }, "Failed to register slash commands");
  }
}

export async function startBot() {
  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
  });

  client.once("ready", async (c) => {
    logger.info({ tag: c.user.tag }, "Discord bot logged in");
    await registerCommands(c.user.id);
  });

  client.on("interactionCreate", async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName === "vouch") {
      await handleVouch(interaction, client);
    } else if (interaction.commandName === "embed") {
      await handleEmbed(interaction, client);
    } else if (interaction.commandName === "massdm") {
      await handleMassDm(interaction);
    }
  });

  client.on("error", (err) => {
    logger.error({ err }, "Discord client error");
  });

  await client.login(TOKEN);
}
