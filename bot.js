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

function main() {
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
	client.on("messageCreate", async function (message) {
		if (message.author.bot) return;
		try {
			const content = await getResonspeFromChatGPT(message, openai);
			// console.log({ message_channel_type: message.channel.type });
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
