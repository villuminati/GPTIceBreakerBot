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

function server() {
	const port = process.env.PORT;
	const app = express();

	app.get("/", (req, res) => {
		res.send("Bot is alive!");
		console.log("Bot is alive!");
	});

	app.listen(port, () => {
		console.log(`App listening on port ${port}`);
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
async function getResonspeFromChatGPTForFirstMessage(message, openai) {
	const response = await openai.createChatCompletion({
		model: "gpt-3.5-turbo",
		messages: [
			{
				role: "system",
				content: `You are a greeter that responds to introductory messages by responding warmly and with some inquisitive questions. Don't meander on topics and keep everything related to technology and business. Respond to topics irrelevant to tech with a curt and short decline. Don't make it sound like an interview. Make it sound like conversation at a bar. Remember details that the user tells you. Also end the conversation by second or third message from assistant and after that direct them to mingle in #general-discussion channel.`,
			},
			{ role: "user", content: message.content },
		],
	});
	const content = response.data.choices[0].message;
	return content;
}

function countMessagesFromUser(conversationHistoryInGPTAPIFormat) {
	let userMessages = conversationHistoryInGPTAPIFormat.filter(
		(c) => c.role === "user"
	);
	console.log({ userMessages, length: userMessages.length });
	return userMessages.length;
}
// Get response to message in thread.
async function getResonspeFromChatGPTForThread(
	conversationHistoryInGPTAPIFormat,
	openai
) {
	const numberOfMessagesFromUser = countMessagesFromUser(
		conversationHistoryInGPTAPIFormat
	);
	let systemPrompt =
		"You are a greeter that responds to introductory messages by responding warmly and with some inquisitive questions. Don't meander on topics and keep everything related to technology and business. Respond to topics irrelevant to tech with a curt and short decline. Don't make it sound like an interview. Make it sound like conversation at a bar. Remember details that the user tells you. Also end the conversation by second or third message from assistant and after that direct them to mingle in #general-discussion channel.";

	if (numberOfMessagesFromUser >= 2 && numberOfMessagesFromUser < 3) {
		console.log("QUIET DOWN BITCH");
		systemPrompt =
			"You are a greeter that responds to introductory messages by responding warmly and with some inquisitive questions. Don't meander on topics and keep everything related to technology and business. Respond to topics irrelevant to tech with a curt and short decline. Don't make it sound like an interview. Make it sound like conversation at a bar. Remember details that the user tells you. Your task is to ending the conversation. Direct user to #general-discussion channel. Don't start any new conversation.";
	} else if (numberOfMessagesFromUser >= 3) {
		console.log("SHUT UP BITCH");
		systemPrompt =
			"Directing user to #general-discussion channel is your only job. Don't start any new conversation. Don't continue conversation with user. Just direct user to #general-discussion firmly";
	}
	// Push the system message required by OpenAI API.
	conversationHistoryInGPTAPIFormat.unshift({
		role: "system",
		content: systemPrompt,
	});

	console.log({ conversationHistoryInGPTAPIFormat });
	const response = await openai.createChatCompletion({
		model: "gpt-3.5-turbo",
		messages: conversationHistoryInGPTAPIFormat,
	});
	const content = response.data.choices[0].message;
	return content;
}

async function willMessageBeRepliedTo(client, message) {
	const welcomeChannelId = process.env.WELCOMECHANNELID;
	const welcomeChannel = await client.channels.fetch(welcomeChannelId);

	// if message in a channel (i.e. not in thread)
	if (message.channel.type === ChannelType.GuildText) {
		// if message in a channel, then it should should be in welcome channel
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
			// this needs to be in a try-catch as if message not in welcomeChannel, this statement will throw an error
			const parentMessage = await welcomeChannel.messages.fetch(
				parentMessageId
			);

			// parent Message should be in welcome channel
			if (parentMessage.channel.id === welcomeChannelId) {
				// We also check if the author of this message and author of parent message match
				if (parentMessage.author.username === message.author.username) {
					return true;
				} else {
					return false;
				}
			} else {
				return false;
			}
		} catch (e) {
			// this message in thread but not in welcomeChannel
			return false;
		}
	}
}

async function getConversationHistory(client, message) {
	const botName = process.env.BOTNAME;
	const welcomeChannelId = process.env.WELCOMECHANNELID;
	const welcomeChannel = await client.channels.fetch(welcomeChannelId);
	const parentMessageId = message.channel.id;

	try {
		const parentMessage = await welcomeChannel.messages.fetch(parentMessageId);
		const thread = welcomeChannel.threads.cache.find(
			(x) => x.id === parentMessageId
		);
		const messages = await thread.messages.fetch({ limit: 100 });
		let messagesInGPTAPIFormat = [];

		let prevRole = null;
		// Messages are iterated in reverse chronological order. We reverse them later on.
		for (let [_, value] of messages) {
			// Not sure why there is one message at the end with empty content, but I'm skipping it here
			if (value.content === "") continue;
			let role;

			if (value.author.username === botName) {
				role = "assistant";
			} else if (value.author.username === parentMessage.author.username) {
				role = "user";
			} else {
				//TODO: Add condition for 3rd party coming into the conversation
				continue;
			}
			const newMessage = { role: role, content: value.content };

			// If user has sent multiple messages subsequently, each of them are
			// appended into single message and sent together. In this scenario,
			// prevRole === role
			if (prevRole === role) {
				const numMessagesPushed = messagesInGPTAPIFormat.length;
				let prevMessage = messagesInGPTAPIFormat[numMessagesPushed - 1];
				prevMessage.content = value.content + ". " + prevMessage.content;
			} else {
				messagesInGPTAPIFormat.push(newMessage);
			}
			prevRole = role;
		}

		// Push the message that began the thread. Messages are in reverse chronological order so this comes toward the end
		messagesInGPTAPIFormat.push({
			role: "user",
			content: parentMessage.content,
		});

		return messagesInGPTAPIFormat;
	} catch (e) {
		console.error(e);
	}
}

function main() {
	const [client, openai] = init();

	client.on("messageCreate", async function (message) {
		try {
			console.log("Message received: " + message.content);
			console.log("Author id: " + message.author);
			console.log("Author username: " + message.author.username);

			if (message.author.bot) return;

			// only respond to messages when they are from the welcome channel
			if (!(await willMessageBeRepliedTo(client, message))) {
				console.log(
					"Message not in welcome channel or author not same as original thread author"
				);
				return;
			}

			if (message.channel.type === ChannelType.GuildText) {
				const content = await getResonspeFromChatGPTForFirstMessage(
					message,
					openai
				);
				const discussThread = await message.startThread({
					name: "Ice Breaker",
					type: "GUILD_PUBLIC_THREAD",
					reason: "test",
					autoArchiveDuration: ThreadAutoArchiveDuration.ThreeDays,
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
