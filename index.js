const fs = require('fs');

const { RefreshingAuthProvider } = require('@twurple/auth');
const { ApiClient } = require('@twurple/api');
const { ChatClient } = require('@twurple/chat');

const { dbLogging, botPrefix, commandCooldown, twitchClientId, twitchClientSecret } = require('./config.json');
const { init_db } = require('./src/datamgmt/setup');
const { insert_bot_user, get_bot_users, remove_bot_user, add_or_edit_command, delete_command, get_commands_for_channels } = require('./src/datamgmt/db_utils');
const { get_fernando_quote } = require('./src/fernando/fernando_util');
const { obtener_respuesta_de_comando } = require('./src/comandos/comandos_util');
const tmi = require('tmi.js');
const axios = require('axios');

// =====================
// CACHE EN MEMORIA
// =====================
const wrCache = {};
const pbCache = {};
const CACHE_TIME = 60000; // 60 segundos


// =====================
// Alias Juegos
// =====================
const GAME_ALIASES = {
    "sm64": "Super Mario 64",
    "mmx": "Mega Man X",
    "alttp": "The Legend of Zelda: A Link to the Past",
    "oot": "The Legend of Zelda: Ocarina of Time",
    "mm": "The Legend of Zelda: Majoras Mask",
    "zelda1": "The Legend of Zelda",
    "zelda2": "The Legend of Zelda: The Adventure of Link",
    "ww": "The Legend of Zelda: Wind Waker",
    "sw": "The legeng of Zelda: Skyward Sword",
    "tp": "The Legend of Zelda: Twilight Princess",
    "botw": "The Legend of Zelda: Breath of the Wild",
    "totk": "The Legend of Zelda: Tears of the Kingdom"
};

// =====================
// Alias globales de categorías
// =====================
const CATEGORY_ALIASES = {
    "nmg": "no major glitches",
    "ng+": "new game plus",
    "low%": "low%"
};

const HELP_COMMANDS = {
    hola: {
        short: "Hace que el bot se una a tu canal",
        usage: "!hola",
        long: "El bot se conecta al canal donde se ejecuta el comando."
    },
    adios: {
        short: "Hace que el bot salga de tu canal",
        usage: "!adios",
        long: "El bot abandona el canal actual."
    },
    clip: {
        short: "Crea un clip del directo",
        usage: "!clip",
        long: "Crea automáticamente un clip del stream actual."
    },
    wr: {
        short: "Muestra el World Record",
        usage: "!wr <juego> [categoría]",
        long: "Consulta speedrun.com y muestra el WR del juego y categoría especificados."
    },
    pb: {
        short: "Muestra los PBs de un jugador",
        usage: "!pb <usuario> [juego]",
        long: "Busca los personal bests de un jugador en speedrun.com."
    },
    fernando: {
        short: "Frase aleatoria de Fernando",
        usage: "!fernando",
        long: "Muestra una frase aleatoria guardada en el bot."
    },
    comando: {
        short: "Crea un comando personalizado",
        usage: "!comando <nombre> <respuesta>",
        long: "Permite a mods crear comandos personalizados para el canal."
    },
    borracomando: {
        short: "Borra un comando del canal",
        usage: "!borracomando <nombre>",
        long: "Elimina un comando personalizado del canal."
    },
    comandos: {
        short: "Lista comandos personalizados",
        usage: "!comandos",
        long: "Muestra todos los comandos creados para el canal."
    }
};



// lista de comandos globales del bot
const global_commands = ['hola', 'adios', 'clip','wr','pb', 'help', 'fernando', 'comando', 'borracomando', 'comandos']

// monitor de cooldown para cada uno de los canales en los que está el bot
const cooldown = {};

// información de token del bot (incluye ID y nombre en Twitch)
let token_info = null;

// clientes de API y de chat
let api_client = null;
let chat_client = null;
let twitchAccessToken = null;

async function getTwitchToken() {
    const response = await axios.post(
        `https://id.twitch.tv/oauth2/token`,
        null,
        {
            params: {
                client_id: process.env.TWITCH_CLIENT_ID,
                client_secret: process.env.TWITCH_CLIENT_SECRET,
                grant_type: "client_credentials"
            }
        }
    );

    twitchAccessToken = response.data.access_token;
}

async function extractGameData(input) {
    const words = input.split(" ");
    let game = null;

    for (let i = words.length; i > 0; i--) {
        let possibleGame = words.slice(0, i).join(" ");

        // Alias si ya tienes GAME_ALIASES declarado, lo usa
        if (typeof GAME_ALIASES !== "undefined") {
            const alias = GAME_ALIASES[possibleGame.toLowerCase()];
            if (alias) possibleGame = alias;
        }

        const res = await axios.get(
            `https://www.speedrun.com/api/v1/games?name=${encodeURIComponent(possibleGame)}&max=5`
        );

        if (!res.data.data || !res.data.data.length) continue;

        game = res.data.data[0];
        const remaining = words.slice(i).join(" ");
        return { game, remaining };
    }

    return null;
}


async function extractGameAndCategory(input) {

    const words = input.split(" ");

    for (let i = words.length; i > 0; i--) {

        const possibleGame = words.slice(0, i).join(" ");
        const normalizedPossible = normalize(possibleGame);

        const search = await axios.get(
            `https://www.speedrun.com/api/v1/games?name=${encodeURIComponent(possibleGame)}&max=10`
        );

        if (!search.data.data || search.data.data.length === 0)
            continue;

        // 🔥 Buscar mejor coincidencia real
        let game = null;

        for (const g of search.data.data) {

            const normalizedGameName = normalize(g.names.international);

            if (normalizedGameName === normalizedPossible) {
                game = g;
                break;
            }

            if (normalizedGameName.includes(normalizedPossible) ||
                normalizedPossible.includes(normalizedGameName)) {
                game = g;
            }
        }

        if (!game) continue;

        const remaining = words.slice(i).join(" ");

        if (!remaining) {
            return { game, category: null };
        }

        const categoriesRes = await axios.get(
            `https://www.speedrun.com/api/v1/games/${game.id}/categories`
        );

        const categories = categoriesRes.data.data;
        const normalizedRemaining = normalize(remaining);

        for (const cat of categories) {

    const normCat = normalize(cat.name);

    // Coincidencia directa
    if (
        normalizedRemaining.includes(normCat) ||
        normCat.includes(normalizedRemaining)
    ) {
        selectedCategory = cat;
        break;
    }

    // Soporte números (70, 120, etc)
    const numberMatch = normalizedRemaining.match(/\d+/);
    if (numberMatch && normCat.includes(numberMatch[0])) {
        selectedCategory = cat;
        break;
    }

    // 🔥 Detectar dificultad como parte del nombre de categoría
    if (
        normalizedRemaining.includes("hard") &&
        normCat.includes("hard")
    ) {
        selectedCategory = cat;
        break;
    }

    if (
        normalizedRemaining.includes("normal") &&
        !normCat.includes("hard")
    ) {
        if (normCat.includes("any")) {
            selectedCategory = cat;
            break;
        }
    }
}

// 🔥 Si no se detectó categoría, usar la principal
if (!selectedCategory) {

    const mainCategories = categories.filter(
        cat => cat.type === "per-game" && !cat.misc
    );

    if (mainCategories.length > 0) {
        selectedCategory = mainCategories[0];
    } else {
        selectedCategory = categories[0];
    }
}


        return { game, category: null };
    }

    return null;
}

async function searchGame(query) {

    const res = await axios.get(
        `https://www.speedrun.com/api/v1/games?name=${encodeURIComponent(query)}`
    );

    if (!res.data || !res.data.data || res.data.data.length === 0) {
        return null;
    }

    return res.data.data[0];
}

function formatTime(seconds) {

    if (!seconds) return "0s";

    const date = new Date(seconds * 1000);
    const h = Math.floor(seconds / 3600);
    const m = date.getUTCMinutes();
    const s = date.getUTCSeconds();
    const ms = String(seconds % 1).slice(2, 4);

    if (h > 0)
        return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    else
        return `${m}:${String(s).padStart(2, "0")}.${ms}`;
}

function normalize(text) {
    return text
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]/g, "");
}


async function getCurrentStreamGame(channelName) {

    if (!twitchAccessToken) {
        await getTwitchToken();
    }

    const userRes = await axios.get(
        `https://api.twitch.tv/helix/users?login=${channelName.replace("#","")}`,
        {
            headers: {
                "Client-ID": process.env.TWITCH_CLIENT_ID,
                "Authorization": `Bearer ${twitchAccessToken}`
            }
        }
    );

    const userId = userRes.data.data[0].id;

    const streamRes = await axios.get(
        `https://api.twitch.tv/helix/channels?broadcaster_id=${userId}`,
        {
            headers: {
                "Client-ID": process.env.TWITCH_CLIENT_ID,
                "Authorization": `Bearer ${twitchAccessToken}`
            }
        }
    );

    return streamRes.data.data[0].game_name;
}

function mostrarWR(run) {

    const time = formatTime(run.times.primary_t);

    let playerName = "Jugador desconocido";

    if (run.players && run.players.length > 0) {
        if (run.players[0].names) {
            playerName = run.players[0].names.international;
        }
    }

    chat_client.say(channel,
        `🏆 WR ${game.names.international} - ${selectedCategory.name} → ${time} por ${playerName}`
    );
}


function set_cooldown(channel) {
    cooldown[channel] = true;
    setTimeout(() => { cooldown[channel] = false; }, commandCooldown * 1000);
}

async function main() {

    // obtener base de datos
    const db = await init_db(dbLogging);

    // obtener proveedor de autenticación
    const token_data = JSON.parse(await fs.promises.readFile('./tokens.json', 'UTF-8'));
    const auth_provider = new RefreshingAuthProvider(
        {
            clientId: twitchClientId,
            clientSecret: twitchClientSecret,
            onRefresh: async newTokenData => await fs.promises.writeFile('./tokens.json', JSON.stringify(newTokenData, null, 4), 'UTF-8')
        },
        token_data
    );

    // obtener cliente de API de Twitch
    api_client = new ApiClient({ authProvider: auth_provider });

    // registrar canal del bot en base de datos, si no está registrado todavía
    token_info = await api_client.getTokenInfo();
    await insert_bot_user(db, token_info.userId, token_info.userName.toLowerCase());

    // obtener lista de canales a los que el bot debe conectarse
    const user_list = await get_bot_users(db);
    const channel_list = user_list.map(item => item.Name);

    // obtener y conectar cliente de chat de Twitch
    chat_client = new ChatClient({ authProvider: auth_provider, channels: channel_list });
    await chat_client.connect();

    // procesador de mensajes del bot
    chat_client.onMessage(async (channel, user, message, msg) => {
        try {
            // ignorar si no es un comando o si el canal está en cooldown
            if (!message.startsWith(botPrefix)) return;
            if (cooldown[channel]) return;

            message = message.trim().substring(botPrefix.length);
            const args = message.split(/\s+/);
            const comm = args[0].toLowerCase();


            // RUTINAS DE COMANDOS

            // !hola
            if (msg.channelId === token_info.userId && args.length === 1 && comm === 'hola') {
                await insert_bot_user(db, msg.userInfo.userId, msg.userInfo.userName.toLowerCase());
                await chat_client.join(msg.userInfo.userName);
                await chat_client.say(channel, `Hola, ${user}. Me he unido a tu canal.`)
                set_cooldown(channel);
                return;
            }

            // !adios
            else if (msg.channelId === token_info.userId && args.length === 1 && comm === 'adios') {
                await remove_bot_user(db, msg.userInfo.userId);
                chat_client.part(msg.userInfo.userName);
                await chat_client.say(channel, `Adiós, ${user}. He salido de tu canal.`)
                set_cooldown(channel);
                return;
            }

            // !clip
            else if (args.length === 1 && comm === 'clip') {
                let clip_id = null;
                try {
                    clip_id = await api_client.clips.createClip({ channelId: msg.channelId });
                } catch (error) {
                    if (error.name === 'HttpStatusCodeError' && error.statusCode === 404) {
                        await chat_client.say(channel, 'No se pueden crear clips en canales desconectados.');
                        set_cooldown(channel);
                        return;
                    }
                    else {
                        await chat_client.say(channel, 'Se ha producido un error al intentar crear el clip.');
                        set_cooldown(channel);
                        throw error;
                    }
                }
                if (clip_id) {
                    await chat_client.say(channel, `https://clips.twitch.tv/${clip_id}`);
                    set_cooldown(channel);
                    return;
                }
            }

        //!wr
        else if (comm === "wr") {

    try {

        const inputRaw = args.slice(1).join(" ");
        if (!inputRaw) {
            await chat_client.say(channel, "📘 Uso: !wr <juego> [categoría/opciones]");
            return;
        }

        let input = inputRaw.toLowerCase();

        // 🔹 Alias manuales
        if (GAME_ALIASES[input]) {
            input = GAME_ALIASES[input];
        }

        const extracted = await extractGameData(input);
        if (!extracted) {
            await chat_client.say(channel, "❌ Juego no encontrado.");
            return;
        }

        const { game, remaining } = extracted;
        const normalizedRemaining = normalize(remaining);

        // 🔹 Categorías y niveles
        const [catRes, lvlRes] = await Promise.all([
            axios.get(`https://www.speedrun.com/api/v1/games/${game.id}/categories`),
            axios.get(`https://www.speedrun.com/api/v1/games/${game.id}/levels`)
        ]);

        const categories = catRes.data.data;
        const levels = lvlRes.data.data;

        let selectedLevel = null;
        for (const lvl of levels) {
            if (normalizedRemaining.includes(normalize(lvl.name))) {
                selectedLevel = lvl;
                break;
            }
        }

        let selectedCategory = null;

for (const cat of categories) {

    // 🔥 Ignorar categorías per-level si el usuario no escribió nivel
    if (cat.type === "per-level" && !selectedLevel) {
        continue;
    }

    const normCat = normalize(cat.name);

    if (
        normalizedRemaining.includes(normCat) ||
        normCat.includes(normalizedRemaining)
    ) {
        selectedCategory = cat;
        break;
    }
}

        if (!selectedCategory) {
            selectedCategory = categories.find(c => c.type === "per-game");
        }
        
        let levelQuery = "";

// 🔥 Si la categoría es per-level
if (selectedCategory.type === "per-level") {

    if (!selectedLevel && levels.length > 0) {
        selectedLevel = levels[0]; // fallback automático
    }

    if (selectedLevel) {
        levelQuery = `&level=${selectedLevel.id}`;
    } else {
        await chat_client.say(channel, "❌ Esta categoría requiere especificar un nivel.");
        return;
    }
}

        if (!selectedCategory) {
            await chat_client.say(channel, "❌ Categoría no encontrada.");
            return;
        }

        // 🔹 Obtener variables reales de la categoría
const varsRes = await axios.get(
    `https://www.speedrun.com/api/v1/categories/${selectedCategory.id}/variables`
);

const subVars = varsRes.data.data.filter(v => v["is-subcategory"]);

// 🔹 Construir parámetros EXACTOS para la API
let varQuery = "";

for (const variable of subVars) {

    for (const [valueId, valueObj] of Object.entries(variable.values.values)) {

        const optionLabel = normalize(valueObj.label);

        // 🔹 Coincidencia directa
        if (normalizedRemaining.includes(optionLabel)) {
            varQuery += `&var-${variable.id}=${valueId}`;
            continue;
        }

        // 🔥 Soporte universal NMG
        if (
            normalizedRemaining.includes("nmg") &&
            (
                optionLabel.includes("nomajorglitches") ||
                optionLabel === "nmg"
            )
        ) {
            varQuery += `&var-${variable.id}=${valueId}`;
            continue;
        }

        // 🔥 Soporte universal NG+
        if (
            normalizedRemaining.includes("ng") &&
            optionLabel.includes("newgame")
        ) {
            varQuery += `&var-${variable.id}=${valueId}`;
            continue;
        }

        // 🔥 Soporte Hard / Normal automático
        if (
            normalizedRemaining.includes("hard") &&
            optionLabel.includes("hard")
        ) {
            varQuery += `&var-${variable.id}=${valueId}`;
            continue;
        }

        if (
            normalizedRemaining.includes("normal") &&
            optionLabel.includes("normal")
        ) {
            varQuery += `&var-${variable.id}=${valueId}`;
            continue;
        }
    }
}

// 🔥 Leaderboard con filtro directo en la API
const leaderboardURL =
    `https://www.speedrun.com/api/v1/leaderboards/${game.id}/category/${selectedCategory.id}?top=1${varQuery}&embed=players`;

const lbRes = await axios.get(leaderboardURL);
const leaderboard = lbRes.data.data;

if (!leaderboard.runs.length) {
    await chat_client.say(channel, "❌ No hay runs para esa combinación.");
    return;
}

const wr = leaderboard.runs[0].run;

        


        let player = "Unknown";

        if (wr.players?.[0]?.names?.international) {
            player = wr.players[0].names.international;
        } else if (wr.players[0]?.rel === "user") {
            const u = await axios.get(`https://www.speedrun.com/api/v1/users/${wr.players[0].id}`);
            player = u.data.data.names.international;
        }

        const time = formatTime(wr.times.primary_t);

        let variableText = [];

        for (const variable of subVars) {
            const valId = wr.values?.[variable.id];
            if (!valId) continue;

            variableText.push(`[${variable.values.values[valId].label}]`);
        }

        await chat_client.say(
            channel,
            `🏆 WR ${game.names.international} – ${selectedCategory.name} ${variableText.join(" ")} → ${time} por ${player}`
        );

    } catch (err) {
        console.error(err);
        await chat_client.say(channel, "❌ Error en !wr.");
    }
}



        //!pb
   else if (comm === 'pb') {

    if (args.length < 2) {
        await chat_client.say(
            channel,
            "📘 Uso: !pb <usuario> [juego]"
        );
        return;
    }

    try {

        const username = args[1];
        const fullInput = args.slice(2).join(" ");
        const cacheKey = `${username}_${fullInput}`.toLowerCase();

        // 🔥 CACHE
        if (pbCache[cacheKey] && Date.now() - pbCache[cacheKey].time < CACHE_TIME) {
            await chat_client.say(channel, pbCache[cacheKey].message);
            return;
        }

        const userSearch = await axios.get(
            `https://www.speedrun.com/api/v1/users?lookup=${encodeURIComponent(username)}`
        );

        if (!userSearch.data.data.length) {
            await chat_client.say(channel, "❌ Usuario no encontrado.");
            return;
        }

        const userId = userSearch.data.data[0].id;

        const pbRes = await axios.get(
            `https://www.speedrun.com/api/v1/users/${userId}/personal-bests?embed=game,category`
        );

        const runs = pbRes.data.data;

        if (!runs.length) {
            await chat_client.say(channel, "❌ No tiene PBs.");
            return;
        }

        // 🔵 SOLO USUARIO → TODOS LOS JUEGOS
        if (!fullInput) {

            let gameMap = {};

            for (const entry of runs) {

                const run = entry.run;
                const gameName = entry.game.data.names.international;
                const time = run.times.primary_t;

                if (!gameMap[gameName] || time < gameMap[gameName]) {
                    gameMap[gameName] = time;
                }
            }

            let results = [];

            for (const gameName in gameMap) {

                const time = gameMap[gameName];

                const hours = Math.floor(time / 3600);
                const minutes = Math.floor((time % 3600) / 60);
                const seconds = (time % 60).toFixed(2);

                const formatted =
                    (hours > 0 ? `${hours}:` : "") +
                    `${minutes.toString().padStart(2, "0")}:` +
                    seconds.toString().padStart(5, "0");

                results.push(`${gameName}: ${formatted}`);
            }

            const message =
                `🎮 PBs de ${username} → ` +
                results.slice(0, 6).join(" | ");

            pbCache[cacheKey] = {
                message,
                time: Date.now()
            };

            await chat_client.say(channel, message);
            return;
        }

        // 🟢 USUARIO + JUEGO
        const result = await extractGameAndCategory(fullInput);

        if (!result) {
            await chat_client.say(channel, "❌ Juego no encontrado.");
            return;
        }

        const gameId = result.game.id;

        const gameRuns = runs.filter(r => r.run.game === gameId);

        if (!gameRuns.length) {
            await chat_client.say(channel, "❌ No tiene PB en ese juego.");
            return;
        }

        let results = [];

        for (const entry of gameRuns) {

            const run = entry.run;
            const categoryName = entry.category.data.name;
            const time = run.times.primary_t;

            const hours = Math.floor(time / 3600);
            const minutes = Math.floor((time % 3600) / 60);
            const seconds = (time % 60).toFixed(2);

            const formatted =
                (hours > 0 ? `${hours}:` : "") +
                `${minutes.toString().padStart(2, "0")}:` +
                seconds.toString().padStart(5, "0");

            results.push(`${categoryName}: ${formatted}`);
        }

        const message =
            `🎯 PBs de ${username} en ${result.game.names.international} → ` +
            results.join(" | ");

        pbCache[cacheKey] = {
            message,
            time: Date.now()
        };

        await chat_client.say(channel, message);

    } catch (error) {
        console.error("PB ERROR:", error.response?.data || error.message);
        await chat_client.say(channel, "Error en comando !pb.");
    }
}

        // !help
else if (comm === 'help') {

    const commandNames = Object.keys(HELP_COMMANDS);
    const perPage = 6; // cantidad por página
    const totalPages = Math.ceil(commandNames.length / perPage);

    // Si escribe !help wr
    if (args.length === 2 && isNaN(args[1])) {

        const cmd = args[1].toLowerCase();

        if (HELP_COMMANDS[cmd]) {
            const info = HELP_COMMANDS[cmd];
            await chat_client.say(channel,
                `📘 !${cmd} → ${info.long} | Uso: ${info.usage}`
            );
        } else {
            await chat_client.say(channel, `❌ El comando !${cmd} no existe.`);
        }

        set_cooldown(channel);
        return;
    }

    // Página
    let page = 1;

    if (args.length === 2 && !isNaN(args[1])) {
        page = parseInt(args[1]);
        if (page < 1) page = 1;
        if (page > totalPages) page = totalPages;
    }

    const start = (page - 1) * perPage;
    const end = start + perPage;

    const pageCommands = commandNames
        .slice(start, end)
        .map(cmd => `!${cmd}`)
        .join(" | ");

    await chat_client.say(channel,
        `📜 Comandos del bot (Página ${page}/${totalPages}): ${pageCommands} | Usa !help <número> o !help <comando>`
    );

    set_cooldown(channel);
    return;
}






            // !fernando
            else if (comm === 'fernando') {
                const quote = await get_fernando_quote();
                await chat_client.say(channel, quote);
                set_cooldown(channel);
                return;
            }  

            // !comando
            else if (comm === 'comando') {
                if (!(msg.userInfo.isBroadcaster || msg.userInfo.isMod)) {
                    await chat_client.say(channel, 'Solo moderadores del canal pueden ejecutar este comando.');
                    set_cooldown(channel);
                    return;
                }
                if (args.length < 3) {
                    await chat_client.say(channel, 'Es necesario especificar el nombre del comando y su respuesta.');
                    set_cooldown(channel);
                    return;
                }
                if (global_commands.includes(args[1].toLowerCase())) {
                    await chat_client.say(channel, 'El nombre del comando no puede coincidir con el de un comando global.');
                    set_cooldown(channel);
                    return;
                }
                await add_or_edit_command(db, args[1].toLowerCase(), msg.channelId, args.slice(2).join(' '));
                await chat_client.say(channel, `El comando ${args[1].toLowerCase()} se ha añadido correctamente al canal.`);
                set_cooldown(channel);
                return;
            }

            // !borracomando
            else if (comm === 'borracomando') {
                if (!(msg.userInfo.isBroadcaster || msg.userInfo.isMod)) {
                    await chat_client.say(channel, 'Solo moderadores del canal pueden ejecutar este comando.');
                    set_cooldown(channel);
                    return;
                }
                if (args.length !== 2) {
                    await chat_client.say(channel, 'Es necesario especificar el nombre del comando a borrar.');
                    set_cooldown(channel);
                    return;
                }
                const borrados = await delete_command(db, args[1].toLowerCase(), msg.channelId);
                if (borrados) {
                    await chat_client.say(channel, `El comando ${args[1].toLowerCase()} se ha eliminado del canal.`);
                }
                else {
                    await chat_client.say(channel, `No existe ningún comando con ese nombre.`);
                }
                set_cooldown(channel);
                return;
            }

            // !comandos
            else if (args.length === 1 && comm === 'comandos') {
                const comms = await get_commands_for_channels(db, [msg.channelId, token_info.userId]);
                if (comms.length === 0) {
                    await chat_client.say(channel, `No hay comandos definidos en este canal.`);
                }
                else {
                    const comm_names = [...new Set(comms.map(item => item.Name))].sort();
                    await chat_client.say(channel, `Mis comandos: ${comm_names.join(', ')}`);
                }
                set_cooldown(channel);
                return;
            }

            // comandos definidos en canales
            else {
                const args = message.split(/\s+/);
                const response = await obtener_respuesta_de_comando(db, comm, [msg.channelId, token_info.userId]);
                if (response) {
                    await chat_client.say(channel, response);
                }
                set_cooldown(channel);
                return;
            }

        } catch (error) {
            console.error(error['message']);
        }
    });
    

    console.log(`Bot arrancado como usuario de Twitch: ${token_info.userName}`);
}

main();