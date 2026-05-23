require("./config.js");
const chalk = require("chalk");
const fs = require("fs");
const util = require("util");
const axios = require('axios');
const crypto = require("crypto");
const { exec, spawn, execSync } = require('child_process');
const { prepareWAMessageMedia, generateWAMessageFromContent, generateWAMessageContent } = require("baileys");
const loadDb = require("./Files/load_database.js");
 
// Fungsi kirim autojpm ke semua grup (kecuali blacklist)
const kirimAutoJpm = async (sock, force = false) => {
  const setting = global.db.settings.autojpm;
  if (!setting.enabled && !force) return { success: 0, fail: 0, skipped: true };
  const now = Date.now();
  if (!force && (now - setting.lastRun) < setting.interval * 60000) 
    return { success: 0, fail: 0, skipped: true };

  const groups = await sock.groupFetchAllParticipating();
  const groupIds = Object.keys(groups).filter(id => !setting.blacklist.includes(id));
  let success = 0, fail = 0;
  for (let id of groupIds) {
    try {
      if (setting.media) {
        const mediaData = setting.media;
        if (mediaData.type === 'image') {
          await sock.sendMessage(id, { 
            image: Buffer.from(mediaData.data, 'base64'), 
            caption: setting.message,
            mimetype: mediaData.mimetype
          });
        } else if (mediaData.type === 'video') {
          await sock.sendMessage(id, { 
            video: Buffer.from(mediaData.data, 'base64'), 
            caption: setting.message,
            mimetype: mediaData.mimetype
          });
        }
      } else {
        await sock.sendMessage(id, { text: setting.message });
      }
      success++;
    } catch (e) {
      fail++;
    }
    await sleep(2000);
  }
  global.db.settings.autojpm.lastRun = now;
  console.log(`Autojpm selesai, sukses: ${success}, gagal: ${fail}`);
  return { success, fail, skipped: false };
};

// Ekspor fungsi agar bisa dipanggil dari index.js
global.kirimAutoJpm = kirimAutoJpm;

global.kirimAutoSwgc = async (sock, force = false) => {
    const setting = global.db.settings.autojpmswgc;
    if (!setting.enabled && !force) return { success: 0, fail: 0, skipped: true };
    const now = Date.now();
    if (!force && (now - setting.lastRun) < setting.interval * 60000) 
        return { success: 0, fail: 0, skipped: true };

    // Upload media sekali jika ada
    let mediaUrl = null;
    let mediaType = null; // 'image' or 'video'
    if (setting.media && setting.media.data) {
        const buffer = Buffer.from(setting.media.data, 'base64');
        const mime = setting.media.mimetype;
        if (/image/.test(mime)) {
            mediaUrl = await global.UploadMedia(buffer, 'image.jpg', 'image');
            mediaType = 'image';
        } else if (/video/.test(mime)) {
            mediaUrl = await global.UploadMedia(buffer, 'video.mp4', 'video');
            mediaType = 'video';
        }
        if (!mediaUrl) console.log('Gagal upload media untuk autojpmswgc');
    }

    const groups = await sock.groupFetchAllParticipating();
    const blacklist = setting.blacklist || [];
    const targetGroups = Object.keys(groups).filter(id => !blacklist.includes(id));
    
    let success = 0, failed = 0;
    const bgColors = ["#FF5733", "#33FF57", "#3357FF", "#F033FF", "#FF33F0", "#33FFF0", "#F0FF33", "#FF8333", "#8333FF", "#33FF83"];
    
    for (const jid of targetGroups) {
        try {
            let content;
            if (mediaUrl && mediaType === 'image') {
                content = {
                    image: { url: mediaUrl },
                    caption: setting.message || undefined
                };
            } else if (mediaUrl && mediaType === 'video') {
                content = {
                    video: { url: mediaUrl },
                    caption: setting.message || undefined,
                    gifPlayback: false
                };
            } else {
                const randomColor = bgColors[Math.floor(Math.random() * bgColors.length)];
                content = {
                    text: setting.message,
                    backgroundColor: randomColor,
                    font: Math.floor(Math.random() * 7) + 1
                };
            }
            const inside = await generateWAMessageContent(content, {
                upload: sock.waUploadToServer || (async (buf) => ({ url: await global.UploadMedia(buf, 'temp') })),
                logger: sock.logger
            });
            const messageSecret = crypto.randomBytes(32);
            const msg = await generateWAMessageFromContent(jid, {
                messageContextInfo: { messageSecret },
                groupStatusMessageV2: {
                    message: {
                        ...inside,
                        messageContextInfo: { messageSecret }
                    }
                }
            }, { userJid: sock.user.id });
            await sock.relayMessage(jid, msg.message, { messageId: msg.key.id });
            success++;
            await sleep(2000);
        } catch (err) {
            console.error(`Gagal kirim story ke ${jid}:`, err);
            failed++;
        }
    }
    global.db.settings.autojpmswgc.lastRun = now;
    console.log(`AutoSwgc selesai, sukses: ${success}, gagal: ${failed}`);
    return { success, fail: failed, skipped: false };
};

module.exports = async (sock, m) => {
  await loadDb(sock, m);
  const isCmd = m?.body?.startsWith(prefix);
  const quoted = m.quoted ? m.quoted : m;
  const mime = quoted?.msg?.mimetype || quoted?.mimetype || null;
  const args = m?.body?.trim().split(/ +/).slice(1) || [];
  const qmsg = m.quoted || m;
  const text = args.join(" ");
  const command = isCmd
    ? m.body.slice(prefix.length).trim().split(" ").shift().toLowerCase()
    : "";
  const cmd = prefix + command;
  const isOwner = m.isOwner
  let metadata = {};
if (m.isGroup) {
    try {
        if (global.groupMetadataCache.has(m.chat)) {
            metadata = await global.groupMetadataCache.get(m.chat);
        } else {
            metadata = await sock.groupMetadata(m.chat);
            global.groupMetadataCache.set(m.chat, metadata);
        }
    } catch (e) {
        metadata = {};
    }
}
  const admins = metadata?.participants
    ? metadata.participants.filter(p => p.admin !== null).map(p => p.id)
    : [];
  m.isAdmin = m.isGroup && admins ? admins.includes(m.sender) : false
  m.isBotAdmin = m.isGroup && admins ? admins.includes(m.botNumber) : false
    
  const qtext = {key: {remoteJid: "status@broadcast", participant: "0@s.whatsapp.net"}, message: {"extendedTextMessage": {"text": `By ${namaOwner}`}}}

    if (isCmd) {
console.log(
  chalk.cyanBright("• Sender :"), chalk.magentaBright(m.chat),
  "\n" + chalk.cyanBright("• Type :"), chalk.yellowBright(m.isGroup ? metadata.subject : "Private"),
  "\n" + chalk.cyanBright("• Command :"), chalk.greenBright(cmd),
  "\n"
);
  }

  switch (command) {
case "menu":
case "allcommand": {
    const menuText = `
\`@𝑺𝒊𝒎𝒑𝒍𝒆𝑩𝒐𝒕_𝑰𝒏𝒇𝒐𝒓𝒎𝒂𝒕𝒊𝒐𝒏\`
▢ YourName - @${m.sender.split("@")[0]}
▢ Botname - *${global.botName}*
▢ BotVersion - 5.0
▢ Owner - t.me/Fyxzpedia

\`⌗ 𝗢𝘁𝗼𝗺𝗮𝘁𝗶𝘀𝗮𝘀𝗶\`
▢ .autoswgrup
▢ .setswgrup
▢ .autojpm
▢ .setjpm

\`⌗ 𝗕𝗿𝗼𝗮𝗱𝗰𝗮𝘀𝘁\`
▢ .jaser
▢ .jaserht
▢ .jedajaser
▢ .swgrupall

\`⌗ 𝗣𝘂𝘀𝗵𝗞𝗼𝗻𝘁𝗮𝗸\`
▢ .pushkontak
▢ .setjedapush
▢ .stoppush

\`⌗ 𝗚𝗿𝗼𝘂𝗽\`
▢ .joinallgrup
▢ .outallgrup
▢ .listgc

\`⌗ 𝗢𝘄𝗻𝗲𝗿\`
▢ .enc1-10
▢ .tourl
▢ .brat
▢ .cekidch
▢ .backupsc
▢ .resetsc

\`⌗ 𝗧𝗿𝗮𝗻𝘀𝗮𝗸𝘀𝗶\`
▢ .addlist
▢ .dellist
▢ .list
▢ .payment
▢ .done
▢ .proses
`.trim();

    const quotedTemplate = {
        key: {
            remoteJid: 'status@broadcast',
            participant: '0@s.whatsapp.net'
        },
        message: {
            newsletterAdminInviteMessage: {
                newsletterJid: global.idSaluran,
                newsletterName: global.namaSaluran,
                caption: `Original By Fyxzpedia`,
                inviteExpiration: 0
            }
        }
    };

    await sock.sendMessage(m.chat, {
        text: menuText,
        mentions: [m.sender]
    }, { quoted: quotedTemplate });
}
break;

case "saluran": {
    const channelLink = global.linkSaluran || "https://whatsapp.com/channel/0029VbBouHp0rGiGXagM0f2e";
    await sock.sendMessage(m.chat, {
        text: `📢 *Saluran Resmi ${global.botName}*\n\nKlik link berikut untuk bergabung:\n${channelLink}\n\nAtau ketik .list untuk melihat semua fitur.`,
        buttons: [
            {
                buttonId: channelLink,
                buttonText: { displayText: "🔗 Buka Saluran" },
                type: 1
            }
        ],
        headerType: 1
    }, { quoted: m });
}
break;

case "list": {
    const lists = global.db.settings.lists || {};
    const listNames = Object.keys(lists);
    if (listNames.length === 0) return m.reply("📭 Belum ada list. Gunakan `.addlist nama|isi`");
    
    let text = "*📋 Daftar List:*\n\n";
    listNames.forEach((name, i) => {
        text += `${i+1}. .${name}\n`;
    });
    text += "\nKetik `.nama_list` untuk melihat isinya.";
    m.reply(text);
}
break;

case "addlist": {
    if (!text && !(m.quoted && m.quoted.text) && !/image|video/.test(mime)) {
        return m.reply(`*Cara penggunaan:*\n${cmd} nama|isi\nAtau kirim media dengan caption ${cmd} nama|isi\nAtau reply pesan teks/media dengan ${cmd} nama|isi`);
    }
    
    let pipeIndex = text.indexOf('|');
    if (pipeIndex === -1) return m.reply(`Format salah! Gunakan: ${cmd} nama|isi teks`);
    
    let listName = text.substring(0, pipeIndex).trim().toLowerCase();
    let listText = text.substring(pipeIndex + 1).trim();
    
    if (!listName) return m.reply("Nama list tidak boleh kosong!");
    if (!listText && !/image|video/.test(mime)) return m.reply("Isi teks tidak boleh kosong!");
    
    let media = null;
    if (/image|video/.test(mime)) {
        const buffer = await (m.quoted ? m.quoted.download() : m.download());
        if (buffer) {
            media = {
                type: /image/.test(mime) ? 'image' : 'video',
                data: buffer.toString('base64'),
                mimetype: mime
            };
        }
    } else if (m.quoted && /image|video/.test(m.quoted.mimetype || m.quoted.msg?.mimetype)) {
        const quotedMime = m.quoted.mimetype || m.quoted.msg?.mimetype;
        const buffer = await m.quoted.download();
        if (buffer) {
            media = {
                type: /image/.test(quotedMime) ? 'image' : 'video',
                data: buffer.toString('base64'),
                mimetype: quotedMime
            };
        }
    }
    
    if (!global.db.settings.lists) global.db.settings.lists = {};
    global.db.settings.lists[listName] = {
        text: listText || "",
        media: media || null
    };
    
    m.reply(`✅ List *${listName}* berhasil ditambahkan.`);
}
break;

case "dellist": {
    if (!text) return m.reply(`*Contoh:* ${cmd} namabarang`);
    const listName = text.trim().toLowerCase();
    const lists = global.db.settings.lists || {};
    if (!lists[listName]) return m.reply(`❌ List *${listName}* tidak ditemukan.`);
    
    delete lists[listName];
    m.reply(`✅ List *${listName}* berhasil dihapus.`);
}
break;

case 'enc1': case 'enc2': case 'enc3': case 'enc4': case 'enc5':
case 'enc6': case 'enc7': case 'enc8': case 'enc9': case 'enc10': {
    if (!m.quoted) return m.reply(`Balas teks atau file .js yang ingin di-encrypt!`);

    const JavaScriptObfuscator = require('javascript-obfuscator');
    let kodeAsli = m.quoted.text || m.quoted.body || (m.quoted.download ? (await m.quoted.download()).toString() : "");
    if (!kodeAsli) return m.reply("Kode tidak ditemukan!");

    // Helper Zero Width untuk level tertinggi
    const encodeZero = (text) => text.split('').map(c => c.charCodeAt(0).toString(2).padStart(8, '0').split('').map(b => (b === '1' ? '\u200b' : '\u200c')).join('') + '\u200d').join('');

    try {
        let opt = { compact: true, controlFlowFlattening: false };
        let level = parseInt(command.replace('enc', ''));

        switch (level) {
            case 1: opt = { compact: true, simplify: true }; break;
            case 2: opt = { compact: true, renameGlobals: true }; break;
            case 3: opt = { compact: true, controlFlowFlattening: true, controlFlowFlatteningThreshold: 0.5 }; break;
            case 4: opt = { compact: true, controlFlowFlattening: true, deadCodeInjection: true, deadCodeInjectionThreshold: 0.2 }; break;
            case 5: opt = { compact: true, stringArray: true, stringArrayThreshold: 0.75, selfDefending: true }; break;
            case 6: opt = { compact: true, controlFlowFlattening: true, stringArrayEncoding: ['base64'], debugProtection: true }; break;
            case 7: opt = { compact: true, splitStrings: true, splitStringsChunkLength: 3, unicodeEscapeSequence: true }; break;
            case 8: opt = { compact: true, controlFlowFlattening: true, deadCodeInjection: true, stringArrayEncoding: ['rc4'], transformObjectKeys: true }; break;
            case 9: opt = { compact: true, controlFlowFlattening: true, selfDefending: true, stringArrayEncoding: ['base64', 'rc4'], numbersToExpressions: true }; break;
            case 10: opt = { compact: true, simplify: true, unicodeEscapeSequence: true, identifierNamesGenerator: 'hexadecimal' }; break;
        }

        let hasilEnc = JavaScriptObfuscator.obfuscate(kodeAsli, opt).getObfuscatedCode();

        // Extra layer untuk level 10 (Zero Width Wrapper)
        if (level === 10) {
            let encoded = encodeZero(hasilEnc);
            hasilEnc = `eval((function(w){return w.split('\\u200d').filter(x=>x).map(x=>String.fromCharCode(parseInt(x.replace(/\\u200b/g,'1').replace(/\\u200c/g,'0'),2))).join('')})('${encoded}'))`;
        }

        await sock.sendMessage(m.chat, { 
            document: Buffer.from(hasilEnc), 
            mimetype: 'application/javascript', 
            fileName: `level_${level}_encrypted.js`,
            caption: `*🔥 OBFUSCATE LEVEL ${level} 🔥*\n\n*Intensitas:* ${level}/10\n*Status:* Sukses Terenkripsi ✅`
        }, { quoted: m });

    } catch (e) {
        console.error(e);
        m.reply("Terjadi kesalahan. Pastikan kode JS kamu valid.");
    }
}
break;

case "tourl":
case "toupload": {
    // Ambil media dari pesan yang direply atau dari pesan langsung
    let mediaBuffer = null;
    let mediaType = "image"; // default, akan diperbaiki dari mime
    let filename = "media";

    // Jika reply pesan yang mengandung media
    if (m.quoted && (m.quoted.mimetype || m.quoted.msg?.mimetype)) {
        const quotedMime = m.quoted.mimetype || m.quoted.msg?.mimetype;
        if (/image/.test(quotedMime)) {
            mediaBuffer = await m.quoted.download();
            mediaType = "image";
            filename = "image.jpg";
        } else if (/video/.test(quotedMime)) {
            mediaBuffer = await m.quoted.download();
            mediaType = "video";
            filename = "video.mp4";
        } else {
            return m.reply("❌ Hanya gambar atau video yang didukung.");
        }
    }
    // Jika kirim media langsung (tanpa reply, dengan caption .tourl)
    else if (/image|video/.test(mime)) {
        mediaBuffer = await (m.quoted ? m.quoted.download() : m.download());
        if (/image/.test(mime)) {
            mediaType = "image";
            filename = "image.jpg";
        } else if (/video/.test(mime)) {
            mediaType = "video";
            filename = "video.mp4";
        }
    }
    else {
        return m.reply(
            `📸 *Cara penggunaan:*\n` +
            `1. Reply pesan yang berisi gambar/video dengan \`${cmd}\`\n` +
            `2. Kirim langsung gambar/video dengan caption \`${cmd}\`\n\n` +
            `*Contoh:* ${cmd} (balas foto/video)`
        );
    }

    if (!mediaBuffer || mediaBuffer.length === 0) {
        return m.reply("❌ Gagal membaca media. Coba kirim ulang.");
    }

    await m.reply(`⏳ Mengunggah ${mediaType}... (bisa makan waktu untuk video besar)`);

    try {
        const url = await global.UploadMedia(mediaBuffer, filename, mediaType);
        if (url && url.startsWith("http")) {
            await m.reply(
                `✅ *Upload Berhasil!*\n\n` +
                `🔗 *URL:* ${url}\n` +
                `📁 *Tipe:* ${mediaType}\n` +
                `📦 *Ukuran:* ${(mediaBuffer.length / 1024 / 1024).toFixed(2)} MB\n\n` +
                `> URL ini bisa digunakan untuk keperluan bot (autojpm, setjpm, dll).`
            );
        } else {
            throw new Error("URL tidak valid");
        }
    } catch (err) {
        console.error("Upload error:", err);
        await m.reply(
            `❌ Gagal mengunggah ${mediaType}.\n` +
            `Kemungkinan penyebab:\n` +
            `• File terlalu besar (>200MB untuk CatBox)\n` +
            `• Gagal koneksi ke server upload\n` +
            `• Coba ulang dengan file yang lebih kecil.`
        );
    }
}
break;

case "brat": {
    if (!text && !(m.quoted && m.quoted.text)) return m.reply(`*Contoh:* ${cmd} Teks\nAtau reply pesan teks dengan ${cmd}\n\nMembuat stiker bergaya BRAT dari teks.`);

    // Ambil teks dari argumen atau reply
    let userText = text;
    if (m.quoted && m.quoted.text) userText = m.quoted.text;
    
    // API key (ganti dengan milik Anda)
    const apikey = "123"; // <-- GANTI DENGAN APIKEY ANDA
    const encodedText = encodeURIComponent(userText);
    const apiUrl = `https://fyxzpedia-apikeys.vercel.app/imagecreator/bratvid?apikey=${apikey}&text=${encodedText}`;
    
    await m.reply(`🎨 Membuat stiker BRAT dari teks: "${userText.substring(0, 30)}${userText.length > 30 ? '...' : ''}"`);
    
    try {
        // Download gambar dari API
        const response = await axios.get(apiUrl, { responseType: 'arraybuffer' });
        const imageBuffer = Buffer.from(response.data);
        
        // Konversi ke stiker
        const Sticker = require('wa-sticker-formatter').Sticker;
        const sticker = new Sticker(imageBuffer, {
            pack: 'Brat Style',
            author: global.namaOwner || 'Brat',
            type: 'full',
            quality: 50
        });
        const stickerBuffer = await sticker.toBuffer();
        
        // Kirim stiker
        await sock.sendMessage(m.chat, { sticker: stickerBuffer }, { quoted: m });
        
    } catch (err) {
        console.error("Brat Error:", err);
        let errorMsg = "❌ Gagal membuat stiker BRAT.\n";
        if (err.response?.status === 401 || err.response?.status === 403) errorMsg += "API Key tidak valid.";
        else if (err.response?.status === 404) errorMsg += "Endpoint API tidak ditemukan.";
        else errorMsg += `Error: ${err.message}`;
        await m.reply(errorMsg);
    }
}
break;
case "npmdl": {
    if (!isOwner) return m.reply(mess.owner);
    
    let packageName = text.trim();
    if (!packageName) return m.reply("*Contoh:* .npmdl @fyxzpedia/bail");
    
    await m.reply(`⏳ Mencari package *${packageName}* di registry NPM...`);
    
    try {
        // 1. Ambil metadata package menggunakan fetchJson
        const registryUrl = `https://registry.npmjs.org/${packageName}`;
        const data = await global.fetchJson(registryUrl);
        
        // 2. Versi terbaru
        const latestVersion = data['dist-tags']?.latest;
        if (!latestVersion) throw new Error("Tidak ditemukan versi terbaru");
        
        // 3. Tarball URL
        const tarballUrl = data.versions[latestVersion]?.dist?.tarball;
        if (!tarballUrl) throw new Error("Tarball tidak ditemukan");
        
        await m.reply(`📦 Package: ${packageName}@${latestVersion}\n📥 Mengunduh tarball...`);
        
        // 4. Download tarball menggunakan axios (tetap butuh axios untuk stream)
        // Alternatif: pakai fetch dan buffer, tapi axios lebih mudah. Jika tetap ingin hindari axios, bisa pakai `global.getBuffer`
        const buffer = await global.getBuffer(tarballUrl);
        
        // 5. Simpan ke file sementara
        const fileName = `${packageName.replace('/', '-')}-${latestVersion}.tgz`;
        const filePath = `./tmp/${fileName}`;
        
        if (!fs.existsSync('./tmp')) fs.mkdirSync('./tmp');
        fs.writeFileSync(filePath, buffer);
        
        // 6. Kirim file
        const fileSize = (fs.statSync(filePath).size / 1024 / 1024).toFixed(2);
        await sock.sendMessage(m.chat, {
            document: fs.readFileSync(filePath),
            fileName: fileName,
            mimetype: 'application/zip',
            caption: `✅ *Download selesai!*\n\n📦 Package: ${packageName}\n🔖 Versi: ${latestVersion}\n📦 Ukuran: ${fileSize} MB`
        }, { quoted: m });
        
        fs.unlinkSync(filePath);
        
    } catch (error) {
        console.error("NPM Download Error:", error);
        let errorMsg = "❌ Gagal mendownload package.\n\n";
        if (error.message.includes('404')) {
            errorMsg += `Package *${packageName}* tidak ditemukan di registry NPM.`;
        } else {
            errorMsg += `Error: ${error.message}`;
        }
        await m.reply(errorMsg);
    }
}
break;

case "outallgrup": {
    if (!isOwner) return m.reply(mess.owner);
    const sub = args[0]?.toLowerCase();

    if (sub === "semua") {
        // Konfirmasi keluar semua grup
        const confirmButtons = [
            { buttonId: `.outallgrup semua-confirm`, buttonText: { displayText: "✅ Ya, Keluar Semua" }, type: 1 },
            { buttonId: `.outallgrup batal`, buttonText: { displayText: "❌ Batal" }, type: 1 }
        ];
        const groups = await sock.groupFetchAllParticipating();
        await sock.sendMessage(m.chat, {
            text: `⚠️ *PERINGATAN!*\n\nAnda akan mengeluarkan bot dari *SEMUA GRUP* (${Object.keys(groups).length} grup).\nTindakan ini TIDAK DAPAT DIBATALKAN.\n\n*Apakah Anda yakin?*`,
            buttons: confirmButtons,
            headerType: 1
        }, { quoted: m });
    } 
    else if (sub === "semua-confirm") {
        await m.reply("🚪 Mengeluarkan bot dari semua grup...");
        const groups = await sock.groupFetchAllParticipating();
        let success = 0, fail = 0;
        for (const [jid, meta] of Object.entries(groups)) {
            try {
                await sock.groupLeave(jid);
                success++;
                await m.reply(`✅ Keluar dari: ${meta.subject}`);
            } catch (err) {
                fail++;
                await m.reply(`❌ Gagal keluar dari: ${meta.subject}`);
            }
            await sleep(2000);
        }
        await m.reply(`📊 *Selesai*\n✅ Berhasil: ${success}\n❌ Gagal: ${fail}`);
    }
    else if (sub === "tertutup") {
        await m.reply("🔍 Mendeteksi grup tertutup...");
        const groups = await sock.groupFetchAllParticipating();
        const closedGroups = [];
        for (const [jid, meta] of Object.entries(groups)) {
            try {
                await sock.groupInviteCode(jid);
            } catch {
                closedGroups.push({ jid, subject: meta.subject });
            }
            await sleep(1000);
        }
        if (closedGroups.length === 0) return m.reply("✅ Tidak ada grup tertutup.");
        global.closedGroupsList = closedGroups;
        const closedButtons = [
            { buttonId: `.outallgrup tertutup-confirm`, buttonText: { displayText: "🚪 Keluar Sekarang" }, type: 1 },
            { buttonId: `.outallgrup batal`, buttonText: { displayText: "❌ Batal" }, type: 1 }
        ];
        let info = `⚠️ Ditemukan *${closedGroups.length} grup tertutup*:\n`;
        closedGroups.slice(0, 10).forEach((g, i) => info += `${i+1}. ${g.subject}\n`);
        if (closedGroups.length > 10) info += `...dan ${closedGroups.length - 10} lainnya.\n`;
        info += `\nKeluar dari grup-grup tersebut?`;
        await sock.sendMessage(m.chat, { text: info, buttons: closedButtons, headerType: 1 }, { quoted: m });
    }
    else if (sub === "tertutup-confirm") {
        if (!global.closedGroupsList) return m.reply("❌ Tidak ada data. Jalankan `.outallgrup tertutup` dulu.");
        await m.reply(`🚪 Keluar dari ${global.closedGroupsList.length} grup tertutup...`);
        let success = 0, fail = 0;
        for (const g of global.closedGroupsList) {
            try {
                await sock.groupLeave(g.jid);
                success++;
                await m.reply(`✅ Keluar dari: ${g.subject}`);
            } catch (err) {
                fail++;
                await m.reply(`❌ Gagal keluar dari: ${g.subject}`);
            }
            await sleep(2000);
        }
        delete global.closedGroupsList;
        await m.reply(`📊 Selesai\n✅ Berhasil: ${success}\n❌ Gagal: ${fail}`);
    }
    else if (sub === "batal") {
        await m.reply("❌ Aksi dibatalkan.");
    }
    else {
        // Menu utama
        const mainButtons = [
            { buttonId: `.outallgrup semua`, buttonText: { displayText: "📁 Semua Grup" }, type: 1 },
            { buttonId: `.outallgrup tertutup`, buttonText: { displayText: "🔒 Grup Tertutup" }, type: 1 },
            { buttonId: `.outallgrup batal`, buttonText: { displayText: "❌ Batal" }, type: 1 }
        ];
        await sock.sendMessage(m.chat, {
            text: "🚪 *Keluar dari Grup*\n\nPilih opsi:\n• Semua Grup - Keluar dari seluruh grup\n• Grup Tertutup - Keluar dari grup yang tidak memiliki invite link\n• Batal",
            buttons: mainButtons,
            headerType: 1
        }, { quoted: m });
    }
}
break;
case "joinallgrup": {
    if (!isOwner) return m.reply(mess.owner);
    const sub = args[0]?.toLowerCase();

    // Jika tidak ada subcommand, tampilkan menu utama (deteksi link)
    if (!sub) {
        let content = text;
        if (m.quoted && m.quoted.text) content = m.quoted.text;
        if (!content) {
            return m.reply(
                `*Cara penggunaan:*\n` +
                `1. Reply pesan yang berisi link grup WhatsApp\n` +
                `2. Langsung ketik: ${cmd} https://chat.whatsapp.com/kode1 https://chat.whatsapp.com/kode2\n\n` +
                `*Contoh reply:*\nUser A: "https://chat.whatsapp.com/abc123 https://chat.whatsapp.com/xyz789"\nAnda reply pesan tersebut dengan ${cmd}`
            );
        }
        const inviteRegex = /chat\.whatsapp\.com\/(?:invite\/)?([A-Za-z0-9_-]{22})/gi;
        const matches = [...content.matchAll(inviteRegex)];
        if (matches.length === 0) return m.reply("❌ Tidak ditemukan link grup WhatsApp yang valid.");
        const inviteCodes = matches.map(m => m[1]);
        global.pendingJoinLinks = inviteCodes;

        const joinButtons = [
            { buttonId: `.joinallgrup semua`, buttonText: { displayText: "📁 Semua Grup" }, type: 1 },
            { buttonId: `.joinallgrup batal`, buttonText: { displayText: "❌ Batal" }, type: 1 }
        ];
        await sock.sendMessage(m.chat, {
            text: `🔗 *Ditemukan ${inviteCodes.length} link grup*\n\n${inviteCodes.map((c, i) => `${i+1}. ${c}`).join('\n')}\n\nPilih aksi:`,
            buttons: joinButtons,
            headerType: 1
        }, { quoted: m });
    }
    else if (sub === "semua") {
        if (!global.pendingJoinLinks) return m.reply("❌ Tidak ada link yang tertunda. Ulangi perintah.");
        const links = global.pendingJoinLinks;
        await m.reply(`🔄 Memproses join ke ${links.length} grup...`);
        let success = 0, fail = 0;
        const failedLinks = [];
        for (let i = 0; i < links.length; i++) {
            const code = links[i];
            try {
                await sock.groupAcceptInvite(code);
                success++;
                await m.reply(`✅ Berhasil join: ${code}`);
            } catch (err) {
                fail++;
                failedLinks.push(code);
                await m.reply(`❌ Gagal join ${code}: ${err.message || "Error"}`);
            }
            await sleep(3000);
        }
        let resultMsg = `📊 *Hasil Join Grup*\n✅ Sukses: ${success}\n❌ Gagal: ${fail}`;
        if (failedLinks.length) resultMsg += `\n\nGagal:\n${failedLinks.map(c => `- ${c}`).join('\n')}`;
        await m.reply(resultMsg);
        delete global.pendingJoinLinks;
    }
    else if (sub === "batal") {
        delete global.pendingJoinLinks;
        await m.reply("❌ Aksi dibatalkan.");
    }
}
break;
case "resetsc": {
    if (!isOwner) return m.reply(mess.owner);
    
    const sub = args[0]?.toLowerCase();
    
    // Jika subcommand confirm, lakukan reset
    if (sub === 'confirm') {
        try {
            const defaultDb = {
                users: {},
                groups: {},
                settings: {
                    namaSaveContact: "Customer",
                    jedaPushkontak: 2000,
                    blacklistJpm: [],
                    delayJaser: 4000,
                    autojpm: {
                        enabled: false,
                        message: "Halo ini pesan otomatis",
                        media: null,
                        interval: 60,
                        lastRun: 0,
                        blacklist: []
                    },
                    autojpmswgc: {
                        enabled: false,
                        message: "Halo ini story otomatis",
                        media: null,
                        interval: 60,
                        lastRun: 0,
                        blacklist: []
                    },
                    autoJoinGC: {
                        enabled: false
                    }
                }
            };
            
            global.db = defaultDb;
            
            const DataBase = require("./Files/database.js");
            const dbFile = new DataBase();
            await dbFile.write(global.db);
            
            // Reload default settings
            const loadDb = require("./Files/load_database.js");
            const dummyM = { sender: m.sender, isGroup: false, chat: m.chat };
            await loadDb(sock, dummyM);
            
            await m.reply("✅ *Database berhasil direset ke default!*");
        } catch (err) {
            console.error("Reset DB error:", err);
            await m.reply(`❌ Gagal mereset database: ${err.message}`);
        }
    } 
    // Jika subcommand cancel, batalkan
    else if (sub === 'cancel') {
        await m.reply("❌ Reset database dibatalkan.");
    } 
    // Jika tidak ada argumen, tampilkan tombol konfirmasi
    else {
        const buttons = [
            { buttonId: `.resetsc confirm`, buttonText: { displayText: "✅ Ya, Reset" }, type: 1 },
            { buttonId: `.resetsc cancel`, buttonText: { displayText: "❌ Batal" }, type: 1 }
        ];
        
        await sock.sendMessage(m.chat, {
            text: `⚠️ *PERINGATAN!*\n\nPerintah ini akan MENGHAPUS semua data berikut:\n• Data user (premium, dll)\n• Data grup (antilink, welcome, dll)\n• Pengaturan autojpm, pushkontak, jeda, dll\n\nData akan direset ke kondisi awal.\n\n*Apakah Anda yakin?*`,
            buttons: buttons,
            headerType: 1
        }, { quoted: m });
    }
}
break;

// Command untuk melihat semua grup bot
case "listgc": {
    if (!isOwner) return;
    const groups = await sock.groupFetchAllParticipating();
    let teks = "📌 Daftar grup yang diikuti bot:\n";
    for (let id in groups) {
        teks += `- ${groups[id].subject}\n- (${id})\n\n`;
    }
    m.reply(teks);
}
break;

 
case "payment": {
    if (!isOwner) return m.reply(mess.owner);
    
    const imageUrl = global.paymentImage || "https://telegra.ph/file/placeholder.jpg";
    const caption = `━━━  𝗟𝗜𝗦𝗧 𝗔𝗟𝗟 𝗣𝗔𝗬𝗠𝗘𝗡𝗧  ━━━\n\n☐ GOPAY : ${global.gopay || "-"}\n☐ DANA  : ${global.dana || "-"}\n☐ OVO   : ${global.ovo || "-"}\n\n𝗡𝗼𝘁𝗲𝗱 : Sertakan bukti pembayaran demi keamanan bersama.\n\n~ ${global.botName}`;
    
    const quotedTemplate = {
        key: {
            remoteJid: 'status@broadcast',
            participant: '0@s.whatsapp.net'
        },
        message: {
            newsletterAdminInviteMessage: {
                newsletterJid: global.idSaluran,
                newsletterName: global.namaSaluran,
                caption: `Payment Info`,
                inviteExpiration: 0
            }
        }
    };
    
    await sock.sendMessage(m.chat, { image: { url: imageUrl }, caption: caption }, { quoted: quotedTemplate });
}
break;

case "done":
case "proses": {
    if (!isOwner) return m.reply(mess.owner);
    if (!text) return m.reply(`*Contoh:* ${cmd} Nama Barang`);
    
    const status = command === "done" ? "Done ✅" : "Proses 🔄";
    const tanggal = new Date().toLocaleDateString('id-ID', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
    
    const pesan = `𝗧𝗲𝗿𝗶𝗺𝗮𝗸𝗮𝘀𝗶𝗵 𝗧𝗲𝗹𝗮𝗵 𝗢𝗿𝗱𝗲𝗿 ✅\n📦 ${text}\n📃 Status : ${status}\n📆 ${tanggal}\n\n📢 𝗟𝗶𝗻𝗸 𝗙𝗿𝗲𝗲 𝗦𝗰𝗿𝗶𝗽𝘁 𝗕𝗼𝘁\nhttps://www.mediafire.com/folder/9h2x8mqxsdl9m/FyxzpediaYT`;
    
    const quotedTemplate = {
        key: {
            remoteJid: 'status@broadcast',
            participant: '0@s.whatsapp.net'
        },
        message: {
            newsletterAdminInviteMessage: {
                newsletterJid: global.idSaluran,
                newsletterName: global.namaSaluran,
                caption: `Order Status`,
                inviteExpiration: 0
            }
        }
    };
    
    await sock.sendMessage(m.chat, { text: pesan }, { quoted: quotedTemplate });
}
break;

// ================= FITUR AUTO STORY GRUP (AUTOSWGRUP) =================
case "autoswgrup": {
    if (!isOwner) return m.reply(mess.owner);
    const sub = args[0]?.toLowerCase();
    if (sub === 'on') {
        global.db.settings.autojpmswgc.enabled = true;
        m.reply('✅ Auto story grup diaktifkan');
    } else if (sub === 'off') {
        global.db.settings.autojpmswgc.enabled = false;
        m.reply('✅ Auto story grup dimatikan');
    } else if (sub === 'status') {
        const s = global.db.settings.autojpmswgc;
        let last = s.lastRun ? new Date(s.lastRun).toLocaleString('id-ID') : 'Belum pernah';
        let next = s.enabled && s.lastRun ? new Date(s.lastRun + s.interval*60000).toLocaleString('id-ID') : '-';
        let mediaInfo = s.media ? (s.media.type === 'image' ? 'Gambar ✅' : 'Video ✅') : 'Tidak ada media';
        let teks = `*Status Auto Story Grup*\n\nEnabled: ${s.enabled ? '✅' : '❌'}\nPesan: ${s.message}\nMedia: ${mediaInfo}\nInterval: ${s.interval} menit\nTerakhir: ${last}\nBerikutnya: ${next}`;
        m.reply(teks);
    } else {
        m.reply(`*Penggunaan Auto Story Grup*\n\n• ${cmd} on\n• ${cmd} off\n• ${cmd} status`);
    }
}
break;

case "setswgrup": {
    if (!isOwner) return m.reply(mess.owner);
    if (!text) return m.reply(`*Contoh:* ${cmd} 1jam|Halo semua\n\nKirim perintah ini dengan GAMBAR atau VIDEO untuk menyertakan media.\n\nFormat interval: angka + jam/menit/detik (contoh: 1jam, 30menit, 120detik)`);
    
    // Ambil bagian pertama sebelum pipe pertama sebagai interval
    let pipeIndex = text.indexOf('|');
    if (pipeIndex === -1) return m.reply('Gunakan format: interval|pesan\nContoh: 1jam|Halo semua');
    
    let intervalStr = text.substring(0, pipeIndex).trim();
    let newMsg = text.substring(pipeIndex + 1).trim();
    
    if (!newMsg) return m.reply('Masukkan teks pesan');
    
    let interval = global.db.settings.autojpmswgc.interval;
    if (intervalStr) {
        let parsed = global.parseDuration(intervalStr);
        if (!parsed) return m.reply('Format interval salah. Gunakan angka + jam/menit/detik (contoh: 1jam, 30menit)');
        interval = parsed;
    }

    let media = null;
    if (/image/.test(mime)) {
        const buffer = await (m.quoted ? m.quoted.download() : m.download());
        if (buffer) {
            media = {
                type: 'image',
                data: buffer.toString('base64'),
                mimetype: mime
            };
        }
    } else if (/video/.test(mime)) {
        const buffer = await (m.quoted ? m.quoted.download() : m.download());
        if (buffer) {
            media = {
                type: 'video',
                data: buffer.toString('base64'),
                mimetype: mime
            };
        }
    }

    global.db.settings.autojpmswgc.message = newMsg;
    global.db.settings.autojpmswgc.media = media;
    global.db.settings.autojpmswgc.interval = interval;
    
    let replyMsg = `✅ Pesan auto story grup diperbarui:\n"${newMsg.substring(0, 100)}${newMsg.length > 100 ? '...' : ''}"\nInterval: ${interval} menit`;
    if (media) replyMsg += `\nMedia ${media.type} disertakan.`;
    else replyMsg += `\n(Tanpa media)`;
    m.reply(replyMsg);
}
break;

 
 

case "stalkch":
case "sch":
case "idch":
case "cekidch": {
    if (!text) return m.reply(`*Contoh:* ${cmd} link/id channel`)
    if (!text.includes("https://whatsapp.com/channel/") && !text.includes("@newsletter"))
        return m.reply("Link atau id channel tidak valid")

    let result = text.trim(), opsi = "jid"
    if (text.includes("https://whatsapp.com/channel/")) {
        result = text.split("https://whatsapp.com/channel/")[1]
        opsi = "invite"
    }

    const res = await sock.newsletterMetadata(opsi, result)
    const teks =
        `*Channel Information 🌍*\n\n` +
        `- Nama: ${res.name}\n` +
        `- Total Pengikut: ${toRupiah(res.subscribers)}\n` +
        `- ID: ${res.id}\n` +
        `- Link: https://whatsapp.com/channel/${res.invite}`

    const msg = generateWAMessageFromContent(m.chat, {
        viewOnceMessage: {
            message: {
                interactiveMessage: {
                    body: { text: teks },
                    nativeFlowMessage: {
                        buttons: [
                            { name: "cta_copy", buttonParamsJson: JSON.stringify({ display_text: "Copy Channel ID", copy_code: res.id }) }
                        ]
                    }
                }
            }
        }
    }, { userJid: m.sender, quoted: m })

    await sock.relayMessage(m.chat, msg.message, { messageId: msg.key.id })
}
break

// ================= FITUR PUSHKONTAK (VERSI FINAL) =================
case "pushkontak":
case "puskontak": {
    if (!isOwner) return m.reply(mess.owner);
    if (!text) return m.reply(`*Contoh:*\n${cmd} Teks pesan yang akan dikirim ke setiap member`);
    
    global.textpushkontak = text;
    
    const groups = await sock.groupFetchAllParticipating();
    if (!groups || Object.keys(groups).length === 0)
        return m.reply("❌ Bot tidak tergabung di grup manapun.");
    
    global.dataAllGrup = groups;
    
    const rows = Object.values(groups).map(g => ({
        title: g.subject || "Tanpa Nama",
        description: `👥 ${g.participants.length} member`,
        id: `.pushkontak-response ${g.id}`
    }));
    
    await sock.sendMessage(m.chat, {
        text: `📢 *PUSH KONTAK*\n\nSilahkan pilih grup target:\n\nPesan: ${text}`,
        viewOnce: true,
        buttons: [
            {
                buttonId: "select_gc",
                buttonText: { displayText: "📂 Pilih Grup" },
                type: 4,
                nativeFlowInfo: {
                    name: "single_select",
                    paramsJson: JSON.stringify({
                        title: "Daftar Grup",
                        sections: [
                            {
                                title: "Pilih Target Grup",
                                rows
                            }
                        ]
                    })
                }
            }
        ],
        headerType: 1
    }, { quoted: m });
}
break;

case "pushkontak-response": {
    if (!isOwner) return;
    if (!global.textpushkontak || !global.dataAllGrup)
        return m.reply("❌ Data pushkontak tidak ditemukan\nSilahkan ulangi dengan *.pushkontak pesan*");
    
    const groupId = text;
    const groupData = global.dataAllGrup[groupId];
    if (!groupData) return m.reply("❌ Grup tidak ditemukan.");
    
    const messageText = global.textpushkontak;
    global.statusPushkontak = true;
    
    let members = groupData.participants
        .map(p => p.id)
        .filter(jid => jid && jid !== m.botNumber);
    
    const namaKontak = global.db.settings.namaSaveContact || "TIDAK DISET";
    await m.reply(
        `🚀 *Memulai Pushkontak*\n\n` +
        `📌 Grup : *${groupData.subject}*\n` +
        `👥 Total : *${members.length} member*\n` +
        `⏱️ Jeda : ${global.db.settings.jedaPushkontak} ms\n` +
        `📝 Nama kontak : ${namaKontak}`
    );
    
    // Template quote untuk setiap pesan
    const quotedTemplate = {
        key: {
            remoteJid: 'status@broadcast',
            participant: '0@s.whatsapp.net'
        },
        message: {
            newsletterAdminInviteMessage: {
                newsletterJid: global.idSaluran || '120363402625644245@newsletter',
                newsletterName: global.namaSaluran || 'Powered by Fyxzpedia',
                caption: `© ${global.namaOwner} • ${global.botName}`,
                inviteExpiration: 0
            }
        }
    };
    
    let success = 0;
    for (const jid of members) {
        try {
            if (!global.statusPushkontak) break;
            
            let targetJid = jid;
            if (jid.includes("@s.whatsapp.net")) {
                try {
                    targetJid = await sock.toLid(jid);
                } catch (e) {
                    console.log("Gagal konversi ke LID, tetap pakai JID asli:", jid);
                }
            }
            
            if (global.db.settings.namaSaveContact) {
                let contactName = global.db.settings.namaSaveContact + " #" + (targetJid.split("@")[0] || "unknown");
                await sock.saveContact(targetJid, contactName);
                await sleep(500);
            }
            
            // Kirim pesan dengan quote template
            await sock.sendMessage(targetJid, { text: messageText }, { quoted: quotedTemplate });
            success++;
            await sleep(global.db.settings.jedaPushkontak);
        } catch (e) {
            console.error("Gagal push ke:", jid, e.message);
        }
    }
    
    delete global.textpushkontak;
    delete global.dataAllGrup;
    global.statusPushkontak = false;
    
    m.reply(
        `✅ *Pushkontak Selesai*\n\n` +
        `📤 Berhasil terkirim ke *${success}* dari *${members.length}* member`
    );
}
break;

case "stoppush": {
    if (!isOwner) return m.reply(mess.owner);
    if (!global.statusPushkontak) return m.reply("Tidak ada pushkontak yang sedang berjalan!");
    global.statusPushkontak = false;
    m.reply(`✅ Berhasil menghentikan pushkontak.`);
}
break;

case "setkontakpush":
case "setkontak": {
    if (!isOwner) return m.reply(mess.owner);
    if (!text) return m.reply(`Masukan nama kontak!\nContoh: ${cmd} MyBuyer`);
    if (text.includes(" ")) return m.reply("Nama kontak dilarang memakai spasi!");
    global.db.settings.namaSaveContact = text;
    m.reply(`✅ Berhasil set nama kontak pushkontak *${text}*`);
}
break;

case "setjedapush":
case "setjedapus": {
    if (!isOwner) return m.reply(mess.owner);
    if (!text) return m.reply(`Masukan angka dalam milidetik (ms)!\n1 detik = 1000\nContoh: ${cmd} 5000`);
    const jeda = parseInt(text);
    if (isNaN(jeda)) return m.reply(`Masukan Angka!\n1 Detik = 1000\nContoh: ${cmd} 5000`);
    if (jeda < 500) return m.reply("Jeda minimal 500 ms untuk menghindari spam.");
    global.db.settings.jedaPushkontak = jeda;
    m.reply(`✅ Berhasil set jeda pushkontak *${jeda} ms* (${jeda/1000} detik)`);
}
break;

// ================= FITUR AUTOJPM =================
case "autojpm": {
  if (!isOwner) return m.reply(mess.owner);
  const sub = args[0]?.toLowerCase();
  if (sub === 'on') {
    global.db.settings.autojpm.enabled = true;
    m.reply('✅ Autojpm diaktifkan');
  } else if (sub === 'off') {
    global.db.settings.autojpm.enabled = false;
    m.reply('✅ Autojpm dimatikan');
  } else if (sub === 'status') {
    const s = global.db.settings.autojpm;
    let last = s.lastRun ? new Date(s.lastRun).toLocaleString('id-ID') : 'Belum pernah';
    let next = s.enabled && s.lastRun ? new Date(s.lastRun + s.interval*60000).toLocaleString('id-ID') : '-';
    let teks = `*Status Autojpm*\n\nEnabled: ${s.enabled ? '✅' : '❌'}\nPesan: ${s.message}\nMedia: ${s.media ? '✅' : '❌'}\nInterval: ${s.interval} menit\nBlacklist: ${s.blacklist.length} grup\nTerakhir: ${last}\nBerikutnya: ${next}`;
    m.reply(teks);
  } else {
    m.reply(`*Penggunaan Autojpm*\n\n• ${cmd} on\n• ${cmd} off\n• ${cmd} status`);
  }
}
break;

case "setjpm": {
  if (!isOwner) return m.reply(mess.owner);
  if (!text) return m.reply(`*Contoh:* ${cmd} Halo semuanya|1jam\n\nKirim perintah ini dengan media (gambar/video) untuk menyertakan media.`);
  
  let [newMsg, intervalStr] = text.split('|').map(s => s.trim());
  if (!newMsg) return m.reply('Masukkan teks pesan');
  
  let interval = global.db.settings.autojpm.interval;
  if (intervalStr) {
    let parsed = parseDuration(intervalStr);
    if (!parsed) return m.reply('Format interval salah. Gunakan angka + jam/menit/detik (contoh: 1jam, 30menit)');
    interval = parsed;
  }

  let media = null;
  if (/image|video/.test(mime)) {
    const buffer = await (m.quoted ? m.quoted.download() : m.download());
    if (buffer) {
      media = {
        type: mime.includes('image') ? 'image' : 'video',
        data: buffer.toString('base64'),
        mimetype: mime
      };
    }
  }

  global.db.settings.autojpm.message = newMsg;
  global.db.settings.autojpm.media = media;
  global.db.settings.autojpm.interval = interval;
  
  let replyMsg = `✅ Pesan autojpm diperbarui:\n"${newMsg}"\nInterval: ${interval} menit`;
  if (media) replyMsg += `\nMedia: ${media.type} disertakan.`;
  else replyMsg += `\n(Tanpa media)`;
  m.reply(replyMsg);
}
break;

 

// ================= FITUR JASER (BROADCAST KE SEMUA GRUP) =================
case "jaser":
case "jasher": {
    if (!isOwner) return m.reply(mess.owner);
    if (!text && !/image/.test(mime)) return m.reply(`*Contoh Penggunaan:*\n${cmd} pesannya & bisa dengan foto juga\n\nAtur jeda: .jedajaser 1000ms`);
    
    // Template quoted di dalam case
    const quotedTemplate = {
        key: {
            remoteJid: 'status@broadcast',
            participant: '0@s.whatsapp.net'
        },
        message: {
            newsletterAdminInviteMessage: {
                newsletterJid: `120363402625644245@newsletter`,
                newsletterName: `© Script by Fyxzpedia`,
                caption: `Script by Fyxzpedia`,
                inviteExpiration: 0
            }
        }
    };
    
    let mediaBuffer = null;
    let caption = text;
    
    if (/image/.test(mime)) {
        mediaBuffer = await (m.quoted ? m.quoted.download() : m.download());
        caption = text;
    }
    
    const allGroups = await sock.groupFetchAllParticipating();
    const groupIds = Object.keys(allGroups);
    const blacklist = global.db.settings.blacklistJpm || [];
    const targetGroups = groupIds.filter(id => !blacklist.includes(id));
    const delay = global.db.settings.delayJaser || 4000;
    
    if (targetGroups.length === 0) return m.reply("❌ Tidak ada grup target (semua grup diblacklist JPM).");
    
    await m.reply(`🚀 Memproses broadcast ke ${targetGroups.length} grup (${groupIds.length - targetGroups.length} diblacklist JPM)...\nPesan: ${caption || "tanpa teks"}\nJeda: ${delay} ms (${delay/1000} detik)`);
    
    let success = 0, fail = 0;
    for (const jid of targetGroups) {
        try {
            if (mediaBuffer) {
                await sock.sendMessage(jid, {
                    image: mediaBuffer,
                    caption: caption || ""
                }, { quoted: quotedTemplate });
            } else {
                await sock.sendMessage(jid, { text: caption }, { quoted: quotedTemplate });
            }
            success++;
        } catch (err) {
            console.error(`Gagal kirim ke ${jid}:`, err);
            fail++;
        }
        await sleep(delay);
    }
    m.reply(`✅ Broadcast Jaser selesai!\n📊 Total target: ${targetGroups.length}\n✅ Berhasil: ${success}\n❌ Gagal: ${fail}\n🚫 Diblacklist JPM: ${groupIds.length - targetGroups.length}\n⏱️ Jeda: ${delay} ms`);
}
break;

// ================= FITUR JASERHT (HIDETAG KE SEMUA GRUP) =================
case "jaserht":
case "jasherht":
case "hidetagjaser": {
    if (!isOwner) return m.reply(mess.owner);
    if (!text && !/image/.test(mime)) return m.reply(`*Contoh Penggunaan:*\n${cmd} pesan hidetag\natau kirim gambar dengan caption ${cmd} pesan`);
    
    // Template quoted di dalam case (sama persis)
    const quotedTemplate = {
        key: {
            remoteJid: 'status@broadcast',
            participant: '0@s.whatsapp.net'
        },
        message: {
            newsletterAdminInviteMessage: {
                newsletterJid: `120363402625644245@newsletter`,
                newsletterName: `© Script by Fyxzpedia`,
                caption: `Script by Fyxzpedia`,
                inviteExpiration: 0
            }
        }
    };
    
    let mediaBuffer = null;
    let caption = text;
    
    if (/image/.test(mime)) {
        mediaBuffer = await (m.quoted ? m.quoted.download() : m.download());
        caption = text;
    }
    
    const allGroups = await sock.groupFetchAllParticipating();
    const groupIds = Object.keys(allGroups);
    const blacklist = global.db.settings.blacklistJpm || [];
    const targetGroups = groupIds.filter(id => !blacklist.includes(id));
    const delay = global.db.settings.delayJaser || 4000;
    
    if (targetGroups.length === 0) return m.reply("❌ Tidak ada grup target (semua grup diblacklist JPM).");
    
    await m.reply(`🚀 Memproses HIDETAG ke ${targetGroups.length} grup (${groupIds.length - targetGroups.length} diblacklist JPM)...\nPesan: ${caption || "tanpa teks"}\nJeda: ${delay} ms (${delay/1000} detik)`);
    
    let success = 0, fail = 0;
    for (const jid of targetGroups) {
        try {
            const metadata = await sock.groupMetadata(jid);
            const participants = metadata.participants.map(p => p.id);
            
            if (mediaBuffer) {
                await sock.sendMessage(jid, {
                    image: mediaBuffer,
                    caption: caption || "",
                    mentions: participants
                }, { quoted: quotedTemplate });
            } else {
                await sock.sendMessage(jid, {
                    text: caption,
                    mentions: participants
                }, { quoted: quotedTemplate });
            }
            success++;
        } catch (err) {
            console.error(`Gagal kirim hidetag ke ${jid}:`, err);
            fail++;
        }
        await sleep(delay);
    }
    m.reply(`✅ Hidetag Jaser selesai!\n📊 Total target: ${targetGroups.length}\n✅ Berhasil: ${success}\n❌ Gagal: ${fail}\n🚫 Diblacklist JPM: ${groupIds.length - targetGroups.length}\n⏱️ Jeda: ${delay} ms`);
}
break;

// ================= SETTING JEDA JASER (dalam milidetik) =================
case "jedajaser": {
    if (!isOwner) return m.reply(mess.owner);
    if (!text) {
        const currentDelay = global.db.settings.delayJaser || 4000;
        return m.reply(`⏱️ *Jeda saat ini:* ${currentDelay} ms (${currentDelay/1000} detik)\n\n*Cara mengubah:*\n${cmd} 5000ms\n${cmd} 2000ms\n\nMinimal 1000ms`);
    }
    const match = text.match(/^(\d+)\s*ms$/i);
    if (!match) return m.reply(`❌ Format salah!\n*Contoh:* ${cmd} 5000ms (untuk jeda 5 detik)\n*Minimal:* 1000ms`);
    let delay = parseInt(match[1]);
    if (delay < 1000) return m.reply(`❌ Jeda minimal 1000ms (1 detik) demi kestabilan bot.`);
    global.db.settings.delayJaser = delay;
    m.reply(`✅ Jeda untuk fitur .jaser diubah menjadi *${delay} ms* (${delay/1000} detik).`);
}
break;
// ================= BLACKLIST JASER (TAMBAH) =================
// Menggunakan blacklistJpm yang sudah ada, dengan tampilan sama seperti .bljpm
case "bljaser": {
    if (!isOwner) return m.reply(mess.owner);
    const groups = await sock.groupFetchAllParticipating();
    const groupList = Object.values(groups);
    const blacklist = global.db.settings.blacklistJpm || [];
    
    // Filter grup yang belum diblacklist
    const available = groupList.filter(g => !blacklist.includes(g.id));
    if (available.length === 0) {
        return m.reply("✅ Semua grup sudah masuk blacklist JPM.");
    }
    
    let rows = [];
    for (let g of available) {
        rows.push({
            title: g.subject || "Tanpa Nama",
            description: `ID: ${g.id} | 👥 ${g.participants.length} member`,
            id: `.bljaser-add ${g.id}|${g.subject || "Tanpa Nama"}`
        });
    }
    
    const msg = await generateWAMessageFromContent(m.chat, {
        viewOnceMessage: {
            message: {
                interactiveMessage: {
                    body: {
                        text: `🔴 *Tambah Blacklist Jaser (JPM)*\nPilih grup yang ingin diblacklist dari broadcast .jaser:\n\nTotal tersedia: ${available.length}`
                    },
                    nativeFlowMessage: {
                        buttons: [
                            {
                                name: "single_select",
                                buttonParamsJson: JSON.stringify({
                                    title: "Daftar Grup Tersedia",
                                    sections: [
                                        {
                                            title: "Pilih Grup untuk Diblacklist",
                                            rows: rows
                                        }
                                    ]
                                })
                            }
                        ]
                    }
                }
            }
        }
    }, { userJid: m.sender, quoted: m });
    
    await sock.relayMessage(m.chat, msg.message, { messageId: msg.key.id });
}
break;

case "bljaser-add": {
    if (!isOwner) return;
    if (!text) return;
    const [id, name] = text.split("|").map(s => s.trim());
    if (!id || !name) return m.reply("Data tidak valid.");
    
    if (!global.db.settings.blacklistJpm) global.db.settings.blacklistJpm = [];
    if (global.db.settings.blacklistJpm.includes(id)) {
        return m.reply(`❌ Grup *${name}* sudah ada di blacklist JPM.`);
    }
    
    global.db.settings.blacklistJpm.push(id);
    m.reply(`✅ Grup *${name}* berhasil ditambahkan ke blacklist.`);
}
break;

// ================= HAPUS BLACKLIST JASER =================
case "delbljaser": {
    if (!isOwner) return m.reply(mess.owner);
    const blacklist = global.db.settings.blacklistJpm || [];
    if (blacklist.length === 0) {
        return m.reply("📭 Tidak ada grup dalam blacklist JPM.");
    }
    
    const groups = await sock.groupFetchAllParticipating();
    const groupList = Object.values(groups);
    
    let rows = [
        {
            title: "🗑️ Hapus Semua",
            description: "Hapus semua grup dari blacklist JPM",
            id: `.delbljaser-response all`
        }
    ];
    
    for (let id of blacklist) {
        let grup = groupList.find(g => g.id === id);
        let name = grup ? (grup.subject || "Unknown") : "Unknown (tidak ditemukan)";
        rows.push({
            title: name,
            description: `ID: ${id}`,
            id: `.delbljaser-response ${id}|${name}`
        });
    }
    
    const msg = await generateWAMessageFromContent(m.chat, {
        viewOnceMessage: {
            message: {
                interactiveMessage: {
                    body: {
                        text: `🟢 *Hapus Blacklist Jaser (JPM)*\nPilih grup yang ingin dihapus dari blacklist:\n\nTotal blacklist: ${blacklist.length}`
                    },
                    nativeFlowMessage: {
                        buttons: [
                            {
                                name: "single_select",
                                buttonParamsJson: JSON.stringify({
                                    title: "Daftar Blacklist JPM",
                                    sections: [
                                        {
                                            title: "Pilih Grup untuk Dihapus",
                                            rows: rows
                                        }
                                    ]
                                })
                            }
                        ]
                    }
                }
            }
        }
    }, { userJid: m.sender, quoted: m });
    
    await sock.relayMessage(m.chat, msg.message, { messageId: msg.key.id });
}
break;

case "delbljaser-response": {
    if (!isOwner) return;
    if (!text) return;
    
    if (!global.db.settings.blacklistJpm) global.db.settings.blacklistJpm = [];
    const blacklist = global.db.settings.blacklistJpm;
    
    if (text === "all") {
        global.db.settings.blacklistJpm = [];
        return m.reply("✅ Semua grup berhasil dihapus dari blacklist JPM.");
    }
    
    if (text.includes("|")) {
        const [id, name] = text.split("|").map(s => s.trim());
        if (!blacklist.includes(id)) {
            return m.reply(`❌ Grup *${name}* tidak ada dalam blacklist JPM.`);
        }
        
        global.db.settings.blacklistJpm = blacklist.filter(g => g !== id);
        return m.reply(`✅ Grup *${name}* berhasil dihapus dari blacklist JPM.`);
    }
}
break;
// ================= FITUR AUTO JOIN GRUP =================
case "autojoingc": {
  if (!isOwner) return m.reply(mess.owner);
  const sub = args[0]?.toLowerCase();
  if (sub === 'on') {
    global.db.settings.autoJoinGC.enabled = true;
    m.reply('✅ Auto Join Grup diaktifkan');
  } else if (sub === 'off') {
    global.db.settings.autoJoinGC.enabled = false;
    m.reply('✅ Auto Join Grup dimatikan');
  } else if (sub === 'status') {
    m.reply(`*Status Auto Join Grup*\n\nEnabled: ${global.db.settings.autoJoinGC.enabled ? '✅' : '❌'}`);
  } else {
    m.reply(`*Penggunaan Auto Join Grup*\n\n• ${cmd} on\n• ${cmd} off\n• ${cmd} status`);
  }
}
break;

case "backupsc":
case "bck":
case "backup": {
    if (!isOwner) return m.reply(mess.owner);
    try {
        const tmpDir = "./sampah";
        if (fs.existsSync(tmpDir)) {
            const files = fs.readdirSync(tmpDir).filter(f => f !== "Fyxzpedia");
            for (let file of files) {
                fs.unlinkSync(`${tmpDir}/${file}`);
            }
        }
        await m.reply("Backup Script Bot, Tunggu sebentar...");
        
        const name = global.botName || "Backup"; // Nama file zip
        const exclude = [
            "node_modules",
            "config", 
            "Session",
            "session",
            "Fyxz",
            "package-lock.json",
            "yarn.lock",
            ".npm",
            ".cache",
            ".git",
            "sampah",
            "database.json" // opsional, jika ingin mengecualikan database
        ];
        
        const allItems = fs.readdirSync(".", { withFileTypes: true });
        const filesToZip = [];
        allItems.forEach((item) => {
            if (exclude.includes(item.name)) return;
            filesToZip.push(item.name);
        });

        if (!filesToZip.length) return m.reply("Tidak ada file yang dapat di-backup.");
        
        // Buat perintah zip dengan exclude pattern
        const excludeArgs = exclude.map(e => `-x "${e}/*"`).join(" ");
        execSync(`zip -r ${name}.zip ${filesToZip.join(" ")} ${excludeArgs}`);

        await sock.sendMessage(m.sender, {
            document: fs.readFileSync(`./${name}.zip`),
            fileName: `${name}.zip`,
            mimetype: "application/zip",
            caption: `Backup Script Bot - ${global.botName || "Backup"}`
        }, { quoted: m });

        fs.unlinkSync(`./${name}.zip`);

        if (m.chat !== m.sender) m.reply("✅ Script Bot berhasil dikirim ke Private Chat.");
    } catch (err) {
        console.error("Backup Error:", err);
        m.reply("❌ Terjadi kesalahan saat melakukan backup.");
    }
}
break;

case "swgrupall": {
    if (!isOwner) return m.reply(mess.owner);
    
    let storyText = "";
    let mediaBuffer = null;
    let mediaType = null; // 'image' or 'video'
    
    // Deteksi media dari pesan yang dikirim atau reply
    if (/image/.test(mime)) {
        mediaBuffer = await (m.quoted ? m.quoted.download() : m.download());
        mediaType = 'image';
        storyText = text;
    } else if (/video/.test(mime)) {
        mediaBuffer = await (m.quoted ? m.quoted.download() : m.download());
        mediaType = 'video';
        storyText = text;
    } else {
        storyText = text;
    }
    
    if (!storyText && !mediaBuffer) {
        return m.reply(`❌ Masukkan teks atau kirim GAMBAR/VIDEO dengan caption .swgrupall`);
    }
    
    await m.reply("⏳ Mengirim story ke semua grup... Mohon tunggu.");
    
    try {
        const groups = await sock.groupFetchAllParticipating();
        const groupIds = Object.keys(groups);
        if (groupIds.length === 0) return m.reply("❌ Bot tidak bergabung di grup manapun.");
        
        const bgColors = ["#FF5733", "#33FF57", "#3357FF", "#F033FF", "#FF33F0", "#33FFF0", "#F0FF33", "#FF8333", "#8333FF", "#33FF83"];
        let success = 0, failed = 0;
        
        // Upload media sekali untuk semua grup (hemat bandwith)
        let mediaUrl = null;
        if (mediaBuffer) {
            const ext = mediaType === 'image' ? 'image.jpg' : 'video.mp4';
            mediaUrl = await global.UploadMedia(mediaBuffer, ext, mediaType);
            if (!mediaUrl) throw new Error(`Upload ${mediaType} ke hosting gagal`);
        }
        
        for (const jid of groupIds) {
            try {
                let content;
                if (mediaUrl && mediaType === 'image') {
                    content = {
                        image: { url: mediaUrl },
                        caption: storyText || undefined
                    };
                } else if (mediaUrl && mediaType === 'video') {
                    content = {
                        video: { url: mediaUrl },
                        caption: storyText || undefined,
                        gifPlayback: false
                    };
                } else {
                    const randomColor = bgColors[Math.floor(Math.random() * bgColors.length)];
                    content = {
                        text: storyText,
                        backgroundColor: randomColor,
                        font: Math.floor(Math.random() * 7) + 1
                    };
                }
                
                const inside = await generateWAMessageContent(content, {
                    upload: sock.waUploadToServer || (async (buf) => ({ url: await global.UploadMedia(buf, 'temp') })),
                    logger: sock.logger
                });
                const messageSecret = crypto.randomBytes(32);
                const msg = await generateWAMessageFromContent(jid, {
                    messageContextInfo: { messageSecret },
                    groupStatusMessageV2: {
                        message: {
                            ...inside,
                            messageContextInfo: { messageSecret }
                        }
                    }
                }, { userJid: m.sender });
                
                await sock.relayMessage(jid, msg.message, { messageId: msg.key.id });
                success++;
                await sleep(2000);
            } catch (err) {
                console.error(`Gagal kirim story ke ${jid}:`, err);
                failed++;
            }
        }
        m.reply(`✅ Story selesai dikirim!\n📊 Total grup: ${groupIds.length}\n✅ Berhasil: ${success}\n❌ Gagal: ${failed}`);
    } catch (err) {
        console.error("Error:", err);
        m.reply("❌ Terjadi kesalahan: " + err.message);
    }
}
break;
default:
    // List manager
    if (command && !command.startsWith(global.prefix)) {
        const lists = global.db.settings.lists || {};
        const listData = lists[command];
        if (listData) {
            let caption = listData.text || "📄 Tidak ada teks";
            if (listData.media) {
                const mediaBuffer = Buffer.from(listData.media.data, 'base64');
                const mediaType = listData.media.type;
                if (mediaType === 'image') {
                    await sock.sendMessage(m.chat, { image: mediaBuffer, caption: caption }, { quoted: m });
                } else if (mediaType === 'video') {
                    await sock.sendMessage(m.chat, { video: mediaBuffer, caption: caption }, { quoted: m });
                }
            } else {
                await sock.sendMessage(m.chat, { text: caption }, { quoted: m });
            }
            break;
        }
    }
    // Eval/exec
    if (m.body.toLowerCase().startsWith("xx ")) {
        // ... isi ...
        break;
    }
    if (m.body.toLowerCase().startsWith("x ")) {
        // ... isi ...
        break;
    }
    if (m.body.startsWith('$ ')) {
        // ... isi ...
        break;
    }
    break;
} // <-- ini penutup switch

// Auto join grup (di luar switch)
if (global.db.settings.autoJoinGC?.enabled && m.body) {
    // ...
}

// Penutup module.exports
}; // <-- penutup fungsi async

// Watch file (jika ada)
let file = require.resolve(__filename);
fs.watchFile(file, () => {
    fs.unwatchFile(file);
    delete require.cache[file];
    require(file);
});