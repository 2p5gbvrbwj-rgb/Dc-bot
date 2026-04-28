const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder,
  ChannelType,
  PermissionFlagsBits,
} = require("discord.js");

const TOKEN = process.env.DISCORD_BOT_TOKEN;
const VOUCH_CHANNEL_ID = process.env.VOUCH_CHANNEL_ID;

if (!TOKEN) {
  throw new Error("DISCORD_BOT_TOKEN environment variable is required.");
}
if (!VOUCH_CHANNEL_ID) {
  throw new Error("VOUCH_CHANNEL_ID environment variable is required.");
}

const LIGHT_BLUE = 0x5dade2;
const OWNER_ID = "1481415545256546444";

// ================= COMMANDS =================

const vouchCommand = new SlashCommandBuilder()
  .setName("vouch")
  .setDescription("Leave a vouch for a purchase")
  .addStringOption((opt) =>
    opt.setName("comment").setDescription("What product did you purchase?").setRequired(true)
  )
  .addIntegerOption((opt) =>
    opt.setName("rating").setDescription("Rating out of 10").setRequired(true).setMinValue(1).setMaxValue(10)
  )
  .addStringOption((opt) =>
    opt.setName("payment").setDescription("Payment method used").setRequired(true)
  );

const embedCommand = new SlashCommandBuilder()
  .setName("embed")
  .setDescription("Send a custom embed")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addChannelOption((opt) =>
    opt.setName("channel").setDescription("Channel").setRequired(true)
      .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
  )
  .addStringOption((opt) =>
    opt.setName("text").setDescription("Embed text").setRequired(true)
  )
  .addStringOption((opt) =>
    opt.setName("title").setDescription("Optional title").setRequired(false)
  );

const massDmCommand = new SlashCommandBuilder()
  .setName("massdm")
  .setDescription("DM everyone (owner only)")
  .addStringOption((opt) =>
    opt.setName("message").setDescription("Message").setRequired(true)
  );

// ================= FUNCTIONS =================

function getStars(rating) {
  return "★".repeat(rating) + "☆".repeat(10 - rating);
}

// ================= HANDLERS =================

async function handleVouch(interaction, client) {
  const comment = interaction.options.getString("comment");
  const rating = interaction.options.getInteger("rating");
  const payment = interaction.options.getString("payment");

  const embed = new EmbedBuilder()
    .setColor(LIGHT_BLUE)
    .setTitle("New Vouch")
    .setDescription(comment)
    .addFields(
      { name: "User", value: `<@${interaction.user.id}>` },
      { name: "Rating", value: `${getStars(rating)} (${rating}/10)` },
      { name: "Payment", value: payment }
    );

  try {
    const channel = await client.channels.fetch(VOUCH_CHANNEL_ID);
    if (!channel || !channel.isSendable()) return;

    await channel.send({ embeds: [embed] });

    await interaction.reply({ content: "Vouch sent!", ephemeral: true });
  } catch (err) {
    console.error(err);
    await interaction.reply({ content: "Error sending vouch", ephemeral: true });
  }
}

async function handleEmbed(interaction, client) {
  const targetChannel = interaction.options.getChannel("channel");
  const text = interaction.options.getString("text");
  const title = interaction.options.getString("title");

  const embed = new EmbedBuilder().setColor(LIGHT_BLUE).setDescription(text);
  if (title) embed.setTitle(title);

  try {
    const channel = await client.channels.fetch(targetChannel.id);
    if (!channel || !channel.isSendable()) return;

    await channel.send({ embeds: [embed] });

    await interaction.reply({ content: "Embed sent!", ephemeral: true });
  } catch (err) {
    console.error(err);
    await interaction.reply({ content: "Error sending embed", ephemeral: true });
  }
}

async function handleMassDm(interaction) {
  if (interaction.user.id !== OWNER_ID) {
    return interaction.reply({ content: "Not allowed", ephemeral: true });
  }

  const message = interaction.options.getString("message");
  const members = await interaction.guild.members.fetch();

  let sent = 0;

  for (const member of members.values()) {
    if (member.user.bot) continue;

    try {
      await member.send(message);
      sent++;
    } catch {}
  }

  await interaction.reply({ content: `Sent to ${sent} users`, ephemeral: true });
}

// ================= BOT START =================

async function startBot() {
  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
  });

  client.once("ready", async () => {
    console.log(`Logged in as ${client.user.tag}`);

    const rest = new REST().setToken(TOKEN);
    await rest.put(Routes.applicationCommands(client.user.id), {
      body: [
        vouchCommand.toJSON(),
        embedCommand.toJSON(),
        massDmCommand.toJSON(),
      ],
    });

    console.log("Commands registered");
  });

  client.on("interactionCreate", async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === "vouch") {
      handleVouch(interaction, client);
    } else if (interaction.commandName === "embed") {
      handleEmbed(interaction, client);
    } else if (interaction.commandName === "massdm") {
      handleMassDm(interaction);
    }
  });

  client.login(TOKEN);
}

startBot();
