## Instructions to run & contribute:

**Step 1**: Clone this repo.
**Step 2**: Add `.env` file to root folder of project.  
**Step 3**: Add `OPENAI_API_KEY`, `BOT_TOKEN` and `PORT` fields in `.env`.

You will find `OPENAI_API_KEY` once you set up your account on openai's website and get access to their api.

Create a private discord server and test out this bot there.
You will find `BOT_TOKEN` once you go through the process of setting up a bot on your server and granting the right permissions. Google setting up a discord bot to get more info on the process.

`PORT` any port you'd like to run the bot on your PC.

The .env file should look like :

```
OPENAI_API_KEY=XXXX
BOT_TOKEN=YYYY
PORT=ZZZZ

```

**Step 4**: Then run following from root of project:

```
npm i
npm start
```
