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
				content:
					"You are a Discord bot for the Indian Tech Server. Respond warmly and asking inquisitive questions about user's life or career. Keep conversations light. Make it sound like conversation at a bar. Keep the conversation firmly focused on the user's life and career, and do not wander off the topic. Keep your messages short and concise. Do not engage in creative writing exercises of any kind. Remember details that the user tells you. ",
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
		"You are a Discord bot for the Indian Tech Server. Respond warmly and asking inquisitive questions about user's life or career. Keep conversations light. Make it sound like conversation at a bar. Keep the conversation firmly focused on the user's life and career, and do not wander off the topic. Keep your messages short and concise. Do not engage in creative writing exercises of any kind. Remember details that the user tells you. Here's a list of channels in the server to suggest to user: #⁠rules, #⁠get-roles, #⁠tech-forum, #⁠general-discussion, #⁠off-topic, #⁠sphinx-ama-ask-anything, #⁠general-jobs-and-opportunities, #⁠link-repo, #⁠showcase, #⁠meme-team-6";
	// Terminal case. After 5 user messages no more OpenAI API calls.
	if (numberOfMessagesFromUser >= 5) {
		console.log("User has reached 5 message limit. No more API calls");
		return "Please head on over to #general-discussion and talk to the rest of the members. They are eagerly waiting for you!";
	}
	// Quiten GPT at 2-3 messages
	if (numberOfMessagesFromUser >= 2 && numberOfMessagesFromUser < 3) {
		systemPrompt =
			"You are a Discord bot for the Indian Tech Server. Keep the conversation firmly focused on the user's life and career, and do not wander off the topic. Make it sound like conversation at a bar. Keep your messages short and concise. Do not engage in creative writing exercises of any kind. Remember details that the user tells you. Your task is to end the conversation. Direct user to #general-discussion channel. Don't start any new conversation.  Here's a list of channels in the server to suggest to user: #⁠rules, #⁠get-roles, #⁠tech-forum, #⁠general-discussion, #⁠off-topic, #⁠sphinx-ama-ask-anything, #⁠general-jobs-and-opportunities, #⁠link-repo, #⁠showcase, #⁠meme-team-6";
	}
	// Absolutely shut up GPT at more than 3 (but <5) user messages
	else if (numberOfMessagesFromUser >= 3) {
		console.log(
			"User has reached 3 message threshold. Reaching limit soon ..."
		);

		systemPrompt =
			"Directing user to #general-discussion channel is your only job. Don't start any new conversation. Don't continue conversation with user. Just direct user to #general-discussion firmly.  Here's a list of channels in the server to suggest to user: #⁠rules, #⁠get-roles, #⁠tech-forum, #⁠general-discussion, #⁠off-topic, #⁠sphinx-ama-ask-anything, #⁠general-jobs-and-opportunities, #⁠link-repo, #⁠showcase, #⁠meme-team-6";
	}
	// Push the system message required by OpenAI API.
	conversationHistoryInGPTAPIFormat.unshift({
		role: "system",
		content: systemPrompt,
	});

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
				console.log("Message in channel (not thread)");

				const content = await getResonspeFromChatGPTForFirstMessage(
					message,
					openai
				);
				try {
					const discussThread = await message.startThread({
						name: "Ice Breaker",
						type: "GUILD_PUBLIC_THREAD",
						reason: "test",
						autoArchiveDuration: ThreadAutoArchiveDuration.ThreeDays,
					});
					return discussThread.send(content);
				} catch (e) {
					// TODO : add condition to check if error is specifically that thread already exists
					const welcomeChannelId = process.env.WELCOMECHANNELID;
					const welcomeChannel = await client.channels.fetch(welcomeChannelId);
					const messageId = message.id;

					const discussThread = welcomeChannel.threads.cache.find(
						(t) => t.id === messageId
					);

					return discussThread.send(content);
				}
			} else if (message.channel.type === ChannelType.PublicThread) {
				console.log("Message in thread (not channel)");
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
