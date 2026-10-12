const http = require("node:http");
const { URL } = require("node:url");

const PORT = Number(process.env.PORT || 3000);

const BOT_TOKEN =
    process.env.DISCORD_BOT_TOKEN || "";

const CHANNEL_ID =
    process.env.DISCORD_CHANNEL_ID || "";

const MENTION_USER_ID =
    process.env.DISCORD_MENTION_USER_ID || "";

const API_KEY =
    process.env.API_KEY || "";

const RAILWAY_DOMAIN =
    process.env.RAILWAY_PUBLIC_DOMAIN || "";

const PUBLIC_BASE_URL =
    (
        process.env.PUBLIC_BASE_URL
        ||
        (RAILWAY_DOMAIN
            ? `https://${RAILWAY_DOMAIN}`
            : `http://localhost:${PORT}`)
    ).replace(/\/+$/, "");

const recentAlerts = new Map();

const DEDUPE_MS =
    2 * 60 * 1000;

function json(res, status, data) {
    res.writeHead(status, {
        "Content-Type":
            "application/json; charset=utf-8",
        "Cache-Control":
            "no-store"
    });

    res.end(
        JSON.stringify(data)
    );
}

function safe(value, max = 200) {
    return String(value ?? "")
        .replace(/[\r\n\t]/g, " ")
        .trim()
        .slice(0, max);
}

function escapeHtml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

async function getRobloxHeadshot(userId) {
    try {
        const id =
            String(userId);

        if (!/^\d+$/.test(id)) {
            return null;
        }

        const endpoint =
            "https://thumbnails.roblox.com" +
            "/v1/users/avatar-headshot" +
            `?userIds=${encodeURIComponent(id)}` +
            "&size=420x420" +
            "&format=Png" +
            "&isCircular=false";

        const response =
            await fetch(endpoint);

        if (!response.ok) {
            return null;
        }

        const data =
            await response.json();

        return (
            data
            &&
            Array.isArray(data.data)
            &&
            data.data[0]
            &&
            data.data[0].imageUrl
        ) || null;

    } catch {
        return null;
    }
}

async function discordMessage(payload) {
    if (!BOT_TOKEN) {
        throw new Error(
            "DISCORD_BOT_TOKEN no configurado"
        );
    }

    if (!CHANNEL_ID) {
        throw new Error(
            "DISCORD_CHANNEL_ID no configurado"
        );
    }

    const response =
        await fetch(
            `https://discord.com/api/v10/channels/${CHANNEL_ID}/messages`,
            {
                method: "POST",

                headers: {
                    "Authorization":
                        `Bot ${BOT_TOKEN}`,

                    "Content-Type":
                        "application/json"
                },

                body:
                    JSON.stringify(payload)
            }
        );

    const text =
        await response.text();

    if (!response.ok) {
        throw new Error(
            `Discord ${response.status}: ${text}`
        );
    }

    try {
        return JSON.parse(text);
    } catch {
        return {};
    }
}

async function sendFoundAlert(data) {
    const username =
        safe(data.username, 50);

    const displayName =
        safe(
            data.displayName || username,
            50
        );

    const userId =
        safe(data.robloxUserId, 30);

    const placeId =
        safe(data.placeId, 30);

    const jobId =
        safe(data.jobId, 128);

    const plaza =
        safe(data.plaza || "?", 20);

    const playerCount =
        safe(data.playerCount || "?", 10);

    if (
        !username
        ||
        !/^\d+$/.test(userId)
        ||
        !/^\d+$/.test(placeId)
        ||
        !jobId
    ) {
        throw new Error(
            "Datos de Roblox inválidos"
        );
    }

    const profileUrl =
        `https://www.roblox.com/users/${userId}/profile`;

    const joinUrl =
        PUBLIC_BASE_URL +
        "/join" +
        `?placeId=${encodeURIComponent(placeId)}` +
        `&jobId=${encodeURIComponent(jobId)}`;

    const avatar =
        await getRobloxHeadshot(
            userId
        );

    const mention =
        MENTION_USER_ID
            ? `<@${MENTION_USER_ID}>`
            : "";

    const fields = [
        {
            name: "👤 ROBLOX",
            value:
                `**@${username}**`,
            inline: true
        },
        {
            name: "🏷️ DISPLAY",
            value:
                `**${displayName}**`,
            inline: true
        },
        {
            name: "🆔 USER ID",
            value:
                `\`${userId}\``,
            inline: true
        },
        {
            name: "🔄 PLAZA",
            value:
                `**#${plaza}**`,
            inline: true
        },
        {
            name: "👥 PLAYERS",
            value:
                `**${playerCount}**`,
            inline: true
        },
        {
            name: "🎮 PLACE ID",
            value:
                `\`${placeId}\``,
            inline: true
        },
        {
            name: "🛰️ SERVER INSTANCE",
            value:
                `\`${jobId}\``,
            inline: false
        }
    ];

    const embed = {
        title:
            "🎯 PLAYER FOUND",

        description:
            `Se encontró a **@${username}** en una plaza activa.\n` +
            "El servidor estaba disponible al momento de la detección.",

        color:
            0x57F287,

        fields,

        footer: {
            text:
                "Plaza Finder • Live Detection"
        },

        timestamp:
            new Date().toISOString()
    };

    if (avatar) {
        embed.thumbnail = {
            url: avatar
        };
    }

    return discordMessage({
        content:
            mention,

        allowed_mentions: {
            users:
                MENTION_USER_ID
                    ? [MENTION_USER_ID]
                    : []
        },

        embeds: [
            embed
        ],

        components: [
            {
                type: 1,

                components: [
                    {
                        type: 2,
                        style: 5,
                        label:
                            "🚀 JOIN SERVER",
                        url:
                            joinUrl
                    },
                    {
                        type: 2,
                        style: 5,
                        label:
                            "👤 VER PERFIL",
                        url:
                            profileUrl
                    }
                ]
            }
        ]
    });
}

function joinPage(
    res,
    placeId,
    jobId
) {
    const deepLink =
        "roblox://experiences/start" +
        `?placeId=${encodeURIComponent(placeId)}` +
        `&gameInstanceId=${encodeURIComponent(jobId)}`;

    const deepJson =
        JSON.stringify(deepLink);

    const escapedDeep =
        escapeHtml(deepLink);

    const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta
  name="viewport"
  content="width=device-width, initial-scale=1"
>
<title>Plaza Finder • Join Server</title>

<style>
* {
    box-sizing: border-box;
}

body {
    margin: 0;
    min-height: 100vh;
    display: grid;
    place-items: center;
    background:
        radial-gradient(
            circle at top,
            #253458 0%,
            #101521 42%,
            #07090e 100%
        );
    color: #fff;
    font-family:
        Inter,
        system-ui,
        Arial,
        sans-serif;
}

.card {
    width: min(
        92vw,
        430px
    );
    padding: 32px;
    border-radius: 24px;
    background:
        rgba(
            17,
            21,
            31,
            0.94
        );
    border:
        1px solid
        rgba(
            255,
            255,
            255,
            0.09
        );
    box-shadow:
        0 30px 90px
        rgba(
            0,
            0,
            0,
            0.5
        );
    text-align: center;
}

.icon {
    width: 72px;
    height: 72px;
    margin: 0 auto 18px;
    display: grid;
    place-items: center;
    border-radius: 22px;
    background:
        linear-gradient(
            135deg,
            #5865f2,
            #7c5cff
        );
    font-size: 34px;
}

h1 {
    margin: 0;
    font-size: 25px;
}

.subtitle {
    margin:
        10px 0 24px;
    color: #aab1c2;
    line-height: 1.5;
}

.server {
    padding: 12px;
    margin-bottom: 20px;
    border-radius: 12px;
    background: #0b0e15;
    color: #8f9bb3;
    font-family: monospace;
    font-size: 11px;
    overflow-wrap: anywhere;
}

.button {
    display: block;
    width: 100%;
    padding: 15px 18px;
    text-decoration: none;
    border-radius: 13px;
    background:
        linear-gradient(
            135deg,
            #20c977,
            #16a967
        );
    color: white;
    font-weight: 800;
    font-size: 15px;
}

.small {
    margin-top: 16px;
    color: #687086;
    font-size: 12px;
}
</style>
</head>

<body>
<div class="card">

    <div class="icon">
        🎮
    </div>

    <h1>
        Abriendo Roblox
    </h1>

    <div class="subtitle">
        Intentando conectarte directamente
        a la instancia detectada.
    </div>

    <div class="server">
        ${escapeHtml(jobId)}
    </div>

    <a
        class="button"
        href="${escapedDeep}"
    >
        🚀 ABRIR ROBLOX
    </a>

    <div class="small">
        Si Roblox no se abre automáticamente,
        toca el botón.
    </div>

</div>

<script>
const target = ${deepJson};

setTimeout(() => {
    window.location.href = target;
}, 350);
</script>

</body>
</html>`;

    res.writeHead(
        200,
        {
            "Content-Type":
                "text/html; charset=utf-8",

            "Cache-Control":
                "no-store"
        }
    );

    res.end(html);
}

const server =
    http.createServer(
        async (req, res) => {

            try {
                const currentUrl =
                    new URL(
                        req.url,
                        `http://${req.headers.host || "localhost"}`
                    );

                if (
                    req.method === "GET"
                    &&
                    currentUrl.pathname === "/"
                ) {
                    return json(
                        res,
                        200,
                        {
                            ok: true,
                            name:
                                "Plaza Finder API",
                            version:
                                "1.0.0"
                        }
                    );
                }

                if (
                    req.method === "GET"
                    &&
                    currentUrl.pathname
                        === "/health"
                ) {
                    return json(
                        res,
                        200,
                        {
                            ok: true,
                            discord:
                                Boolean(
                                    BOT_TOKEN
                                    &&
                                    CHANNEL_ID
                                ),
                            publicUrl:
                                PUBLIC_BASE_URL,
                            time:
                                new Date()
                                    .toISOString()
                        }
                    );
                }

                if (
                    req.method === "GET"
                    &&
                    currentUrl.pathname
                        === "/join"
                ) {
                    const placeId =
                        currentUrl
                            .searchParams
                            .get("placeId")
                        || "";

                    const jobId =
                        currentUrl
                            .searchParams
                            .get("jobId")
                        || "";

                    if (
                        !/^\d{1,25}$/.test(
                            placeId
                        )
                        ||
                        !/^[A-Za-z0-9_-]{8,128}$/.test(
                            jobId
                        )
                    ) {
                        return json(
                            res,
                            400,
                            {
                                ok: false,
                                error:
                                    "invalid_join_data"
                            }
                        );
                    }

                    return joinPage(
                        res,
                        placeId,
                        jobId
                    );
                }

                if (
                    req.method === "POST"
                    &&
                    currentUrl.pathname
                        === "/found"
                ) {
                    if (
                        !API_KEY
                        ||
                        req.headers["x-api-key"]
                            !== API_KEY
                    ) {
                        return json(
                            res,
                            401,
                            {
                                ok: false,
                                error:
                                    "unauthorized"
                            }
                        );
                    }

                    let raw = "";

                    req.on(
                        "data",
                        chunk => {
                            raw += chunk;

                            if (
                                raw.length
                                > 25000
                            ) {
                                req.destroy();
                            }
                        }
                    );

                    req.on(
                        "end",
                        async () => {

                            try {
                                const data =
                                    JSON.parse(
                                        raw || "{}"
                                    );

                                const userId =
                                    safe(
                                        data.robloxUserId,
                                        30
                                    );

                                const jobId =
                                    safe(
                                        data.jobId,
                                        128
                                    );

                                const key =
                                    `${userId}:${jobId}`;

                                const now =
                                    Date.now();

                                const old =
                                    recentAlerts.get(
                                        key
                                    );

                                if (
                                    old
                                    &&
                                    now - old
                                        < DEDUPE_MS
                                ) {
                                    return json(
                                        res,
                                        200,
                                        {
                                            ok: true,
                                            duplicate:
                                                true
                                        }
                                    );
                                }

                                await sendFoundAlert(
                                    data
                                );

                                recentAlerts.set(
                                    key,
                                    now
                                );

                                for (
                                    const [k, time]
                                    of recentAlerts
                                ) {
                                    if (
                                        now - time
                                        >
                                        DEDUPE_MS * 4
                                    ) {
                                        recentAlerts.delete(
                                            k
                                        );
                                    }
                                }

                                return json(
                                    res,
                                    200,
                                    {
                                        ok: true,
                                        sent: true
                                    }
                                );

                            } catch (error) {
                                console.error(
                                    error
                                );

                                return json(
                                    res,
                                    500,
                                    {
                                        ok: false,
                                        error:
                                            String(
                                                error.message
                                                || error
                                            )
                                    }
                                );
                            }
                        }
                    );

                    return;
                }

                return json(
                    res,
                    404,
                    {
                        ok: false,
                        error:
                            "not_found"
                    }
                );

            } catch (error) {
                console.error(
                    error
                );

                return json(
                    res,
                    500,
                    {
                        ok: false,
                        error:
                            "internal_error"
                    }
                );
            }
        }
    );

server.listen(
    PORT,
    "0.0.0.0",
    () => {
        console.log(
            `Plaza Finder API online on ${PORT}`
        );

        console.log(
            `Public URL: ${PUBLIC_BASE_URL}`
        );
    }
);