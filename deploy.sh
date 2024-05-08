#!/usr/bin/env bash
set -euo pipefail

git_url="$GIT_URL"
git_ref="$GIT_REF"
deploy_path="$DEPLOY_PATH"
deploy_port="${DEPLOY_PORT:-"3000"}"
service_name="${SERVICE_NAME:-"anime-poster-quiz"}"
media_data_path="${MEDIA_DATA_PATH:-"media.json"}"
fetch_media="${FETCH_MEDIA-}"

service="$(cat <<END
[Unit]
Description=Anime Poster Quiz
After=network.target

[Service]
Type=simple
Environment="DEBUG=1"
WorkingDirectory=$deploy_path
ExecStart=/usr/bin/node server.mjs serve -p "$deploy_port" ${NO_MEDIA_DATA:+"--no-media-data"} --media-data "$media_data_path"
Restart=on-failure

[Install]
WantedBy=default.target
END
)"


create_dir() {
    d="$(dirname "$deploy_path")"
    if [ ! -e "$d" ]; then
        mkdir -p "$d"
    fi
}

update() {
    if [ ! -e "$deploy_path" ]; then
        git clone "$git_url" "$deploy_path"
    fi
    cd "$deploy_path"
    git fetch
    git checkout "$git_ref"
    npm install
}

stop_service() {
    if systemctl --user is-enabled "$service_name" &> /dev/null; then
        systemctl --user disable --now "$service_name" || true
    fi
}

install_service() {
    local folder="$HOME/.config/systemd/user"
    local unit="$folder/$service_name.service"
    if [ ! -e "$folder" ]; then
        mkdir -p "$folder"
    fi
    printf "%s" "$service" >"$unit"
    chmod 644 "$unit"
    systemctl --user daemon-reload
    systemctl --user enable --now "$service_name"
}

fetch_data() {
    if [[ $(find "$media_data_path" -mtime -30 2>/dev/null) ]]; then
        echo "Data seems recent. Not updating"
        return 0
    fi
    ./fetch-data.sh "$media_data_path"
}

create_dir
update
if [ "${fetch_data-}" ]; then
    fetch_data
fi
stop_service
install_service
