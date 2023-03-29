import dotenv from "dotenv";
import {
	Client,
	GatewayIntentBits,
	ThreadAutoArchiveDuration,
	ChannelType,
} from "discord.js";
import { Configuration, OpenAIApi } from "openai";

async function getResonspeFromChatGPT(message, openai) {
	const response = await openai.createChatCompletion({
		model: "gpt-3.5-turbo",
		messages: [
			{
				role: "system",
				content:
					"You are a greeter that responds to introductory messages by responding warmly and with some  inquisitive questions. Don't make it sound like an interview. Make it sound like conversation at a bar.",
			},
			{ role: "user", content: message.content },
		],
	});
	const content = response.data.choices[0].message;
	return content;
}

function init() {
	dotenv.config();

	const client = new Client({
		intents: [
			GatewayIntentBits.Guilds,
			GatewayIntentBits.GuildMessages,
			GatewayIntentBits.MessageContent,
			GatewayIntentBits.DirectMessageTyping,
		],
	});

	const openai = new OpenAIApi(
		new Configuration({
			apiKey: process.env.OPENAI_API_KEY,
		})
	);
	return [client, openai];
}

async function isMessageInWelcomeChannel(client, message) {
	const welcomeChannelId = "1079360210981900313";
	const welcomeChannel = await client.channels.fetch(welcomeChannelId);

	// if message in a channel (i.e. not in thread)
	if (message.channel.type === ChannelType.GuildText) {
		if (message.channel.id === welcomeChannelId) {
			return true;
		} else {
			return false;
		}
	}
	// if message in a thread
	if (message.channel.type === ChannelType.PublicThread) {
		const parentMessageId = message.channel.id;
		try {
			// this needs to in a try as if message not in welcomeChannel, this statement will throw an error
			const parentMessage = await welcomeChannel.messages.fetch(
				parentMessageId
			);
			if (parentMessage.channel.id === welcomeChannelId) return true;
		} catch (e) {
			// this message in thread but not in welcomeChannel
			return false;
		}
	}
}

function main() {
	const [client, openai] = init();

	client.on("messageCreate", async function (message) {
		if (message.author.bot) return;

		// only respond to messages when they are from the welcome channel
		if (!(await isMessageInWelcomeChannel(client, message))) {
			console.log("Not in welcome channel ");
			return;
		}

		try {
			const content = await getResonspeFromChatGPT(message, openai);
			if (message.channel.type === ChannelType.GuildText) {
				const discussThread = await message.startThread({
					name: "Ice Breaker",
					type: "GUILD_PUBLIC_THREAD",
					reason: "test",
					autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek,
				});
				return discussThread.send(content);
			} else if (message.channel.type === ChannelType.PublicThread) {
				return message.reply(content);
			}
		} catch (err) {
			console.error(err);
			return message.reply("As an AI robot, I errored out.");
		}
	});

	client.login(process.env.BOT_TOKEN);
}

main();
