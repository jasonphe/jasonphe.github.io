
import { imgDict, audioDict } from "./globals.js";
let assetFolder = "assets/";
let imgsToLoad = ["right", "background2"];
let audioToLoad = ["badCollect1.wav", "badCollect2.wav", "collect1.wav", "collect2.wav", "collect3.wav", "collect4.wav", "lose.wav", "win.wav", "powerUp.wav"];
export let levelsObj;

async function loadImages() {
    let promises = [];
	imgsToLoad.forEach(imgString => {
		let img = new Image();
		img.src = assetFolder + imgString + ".png";
		imgDict[imgString] = img;
	});
    for (const [ string, img ] of Object.entries(imgDict))
    {
        if(img.complete)
            promises.push(Promise.resolve(true));
        else
            promises.push(new Promise(resolve => {
                img.addEventListener('load', () => resolve(true));
                img.addEventListener('error', () => resolve(false));
            }));
    }

    return promises;
}

async function loadJSON() {
    return fetch('./levels.json').then(response => {
        return response.json();
      }).then(data => {
        levelsObj = data;
        console.log("levels loaded");
        return Promise.resolve(true);
      }).catch(err => {
        console.log("levels failed" + err);
        return Promise.resolve(false);
      });
}

async function loadAudio() {
    let promises = [];
	audioToLoad.forEach(fileName => {
		let audio = new Audio();
		audio.src = assetFolder + fileName;
		audioDict[fileName] = audio;
	});
    for (const [ string, audio ] of Object.entries(audioDict))
    {
        if(audio.readyState == 4)
            promises.push(Promise.resolve(true));
        else
            promises.push(new Promise(resolve => {
                audio.addEventListener('canplaythrough', () => resolve(true));
                audio.addEventListener('error', () => resolve(false));
            }));
    }

    return promises;
} 

export function loadAssets(callback) {
    Promise.all([loadImages(), loadJSON(), loadAudio()]).then(results => {
        if (results.every(res => res)) {
            console.log('all items loaded successfully');
            callback();
        }
        else
            console.log('some items failed to load, all finished loading');
    });
}