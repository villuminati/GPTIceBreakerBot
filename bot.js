import dotenv from "dotenv";
import {
	Client,
	GatewayIntentBits,
	ThreadAutoArchiveDuration,
	ChannelType,
	ThreadChannel,
} from "discord.js";
import { Configuration, OpenAIApi } from "openai";
import express from "express";

const welcomeChannelId = "1080147198924296223";
const botName = "GPTIceBreakerBot";

function server() {
	const port = process.env.PORT;
	console.log("port: ", port);
	const app = express();
	app.get("/", (req, res) => {
		res.send("Bot is alive!");
		console.log("Bot is alive!");
	});

	app.listen(port, () => {
		console.log(`Example app listening on port ${port}`);
	});
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
	server();
	return [client, openai];
}

// Get response to direct message in channel (i.e. message not in thread)
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

// Get response to message in thread.
async function getResonspeFromChatGPTForThread(
	conversationHistoryInGPTAPIFormat,
	openai
) {
	const response = await openai.createChatCompletion({
		model: "gpt-3.5-turbo",
		messages: conversationHistoryInGPTAPIFormat,
	});
	const content = response.data.choices[0].message;
	return content;
}

async function isMessageInWelcomeChannel(client, message) {
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

async function getConversationHistory(client, message) {
	const welcomeChannel = await client.channels.fetch(welcomeChannelId);
	const parentMessageId = message.channel.id;

	try {
		const parentMessage = await welcomeChannel.messages.fetch(parentMessageId);
		const thread = welcomeChannel.threads.cache.find(
			(x) => x.id === parentMessageId
		);
		const messages = await thread.messages.fetch({ limit: 100 });
		let messagesInGPTAPIFormat = [];

		for (let [_, value] of messages) {
			// Not sure why there is one message at the end with empty content
			if (value.content === "") continue;
			let role;
			if (value.author.username === botName) {
				role = "assistant";
			} else if (value.author.username === parentMessage.author.username) {
				role = "user";
			} else {
				//TODO: Add condition for 3rd party coming into the conversation
			}
			const newMessage = { role: role, content: value.content };
			messagesInGPTAPIFormat.push(newMessage);
		}

		// Push the message that began the thread
		messagesInGPTAPIFormat.push({
			role: "user",
			content: parentMessage.content,
		});

		// Push the system message required by OpenAI API
		messagesInGPTAPIFormat.push({
			role: "system",
			content:
				"You are a greeter that responds to introductory messages by responding warmly and with some  inquisitive questions. Don't make it sound like an interview. Make it sound like conversation at a bar. Remember details that the user tells you. Also end the conversation by second or third message from assistant and after that politely direct them to mingle in #general channel",
		});

		return messagesInGPTAPIFormat;
	} catch (e) {
		console.error(e);
	}
}

function main() {
	const [client, openai] = init();

	client.on("messageCreate", async function (message) {
		console.log("Read message: " + message.content);
		console.log("Author id: " + message.author);
		console.log("Author username: " + message.author.username);

		if (message.author.bot) return;

		// only respond to messages when they are from the welcome channel
		if (!(await isMessageInWelcomeChannel(client, message))) {
			console.log("Not in welcome channel ");
			return;
		}

		try {
			if (message.channel.type === ChannelType.GuildText) {
				const content = await getResonspeFromChatGPT(message, openai);
				const discussThread = await message.startThread({
					name: "Ice Breaker",
					type: "GUILD_PUBLIC_THREAD",
					reason: "test",
					autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek,
				});
				return discussThread.send(content);
			} else if (message.channel.type === ChannelType.PublicThread) {
				// feed gpt conversation history
				const conversationHistoryInGPTAPIFormat = await getConversationHistory(
					client,
					message
				);

				const content = await getResonspeFromChatGPTForThread(
					conversationHistoryInGPTAPIFormat.reverse(),
					openai
				);

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
