# Anime Poster Quiz

## Fetch data

You can fetch Anilist data json file using scripts from `https://github.com/9oOzv/amq-anilist-tool`

```
# Navigate to the `amq-anilist-tool` repository
python3.11 -m venv venv
. venv/bin/activate
pip install -r requirements.txt
python anilist-amq-tool update_data -n -d 'media.json'
```

The above command produces `media.json`, which you can copy over here

## Running

```
npm install
node server.js
```

