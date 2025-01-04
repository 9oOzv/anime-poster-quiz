set -eu

if [ -f ./env.sh ]; then
    . ./env.sh
fi

if [ ! -d ./node_modules ]; then
    npm install
fi

if ! npm outdated; then
    npm update
fi

npm audit fix

node server.mjs "$@"
