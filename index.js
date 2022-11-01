import {youtube as yt_fn} from "@googleapis/youtube";
import {readFile, stat, mkdir, writeFile, readdir, rm} from 'fs/promises';
import {exec} from 'child_process';

const yt = yt_fn('v3');
const config = JSON.parse((await readFile('./config.json')).toString());

/**
 * @param {string} path
 * @return {Promise<boolean>}
 */
export async function exists(path) {
    try {
        await stat(path);
    }
    catch (e) {
        if (e.code === 'ENOENT') {
            return false;
        }
        throw e;
    }
    return true;
}

async function fetchVideos(channel) {
    const result = await yt.search.list({
        part: ['snippet'],
        channelId: channel.id,
        auth: config.apiKey,
        order: 'date',
    });
    return result.data.items;
}

function getVideoPath(video, channel) {
    return `videos/${channel.name}/${video.id.videoId}`;
}

async function downloadVideo(video, channel) {
    const path = getVideoPath(video, channel);
    await mkdir(path, {recursive: true});
    console.log(`Downloading '${video.snippet.title}' from '${channel.name}'`);
    await writeFile(path + '/video.json', JSON.stringify(video, null, 4));
    await new Promise((resolve, reject) => {
        const process = exec(`${config.cli} https://youtu.be/${video.id.videoId} -o ${path}/video.webm`);
        process.on('stdout', console.log);
        process.on('stderr', console.error);
        process.on('close', (code, signal) => {
            if (code === 0) {
                resolve(0);
            }
            else {
                if (signal) {
                    reject(new Error(`Process exited with code ${code} after receiving signal ${signal}`));
                }
                else {
                    reject(new Error(`Process exited with code ${code}`));
                }
            }
        })
    })
    console.log('Done');
}

async function update() {
    for (const channel of config.channels) {
        const videos = await fetchVideos(channel);
        for (const video of videos) {
            if (!await exists(getVideoPath(video, channel))) {
                await downloadVideo(video, channel)
            }
        }
    }
}

await mkdir('videos', {recursive: true});
for (const channel of await readdir('videos')) {
    for (const video of await readdir(`videos/${channel}`)) {
        if ((await readdir(`videos/${channel}/${video}`)).filter(v => !v.endsWith('.part')).length < 2) {
            await rm(`videos/${channel}/${video}`, {recursive: true});
        }
    }
}

await update();