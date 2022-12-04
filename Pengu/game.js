import { Collider } from "./collider.js";
import { Obstacle, Gate, GateParent } from "./obstacle.js";
import { Player } from "./player.js";
//import { Pengu } from "./pengu.js";
import { imgDict, canvas, ctx, baseWidth, baseHeight, oldTimeStamp, setTimestamp } from "./globals.js";
var imgFolder = "assets/";
let imgsToLoad = ["right", "background2"];
let keys = [];

canvas.width = baseWidth;
canvas.height = baseHeight;

var player;
var lastCalledTime;
var fps;
var paused = false;
var canTogglePause = true;
var backgroundSpeed = 2;
var backgroundPos = 0;
var obstacles = [];
var levelsObj;

async function loadImages() {
    let promises = [];
	imgsToLoad.forEach(imgString => {
		let img = new Image();
		img.src = imgFolder + imgString + ".png";
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

function loadAssets() {
    Promise.all([loadImages(), loadJSON()]).then(results => {
        if (results.every(res => res)) {
            beginGame();
            console.log('all images loaded successfully');
        }
        else
            console.log('some images failed to load, all finished loading');
    });
}
loadAssets();

function loadLevel(level) {
    player = new Player();
    let levelIndex = level - 1;
    obstacles = [];
    levelsObj.levels[levelIndex].gateParents.forEach(element => {
        let gateParent = new GateParent(element.x, element.gates)
        obstacles = obstacles.concat(gateParent.gates);
    });
}

function beginGame() { 
    loadLevel(1);
    requestAnimationFrame(loop);
}

function togglePause() {
    paused = !paused;
    canTogglePause = false;
    setTimeout(()=> { canTogglePause = true; }, 300);
}

function loop(timeStamp) {
    if ((keys["p"] || keys["Escape"]) && canTogglePause) {
        togglePause();
    }
    /*if(!lastCalledTime) {
        lastCalledTime = Date.now();
        fps = 0;
        return;
     }
     delta = (Date.now() - lastCalledTime)/1000;
     lastCalledTime = Date.now();
     fps = 1/delta;*/

    let elapsedMS = timeStamp - oldTimeStamp;
    setTimestamp(timeStamp);
    
    if (paused) {
		if (keys["r"]) {
            paused = false;
            loadLevel(1);
		}
	}
    else {
        update(elapsedMS);
        draw();    
    }

    requestAnimationFrame(loop);
}

function update(elapsedMS) {
    player.move(getDirection(), elapsedMS);
    moveBackground() ;
    for (let i = 0; i < obstacles.length; i++) {
        let obstacle = obstacles[i];
        obstacle.move(elapsedMS);
        if (obstacle.isOut())
        {
            obstacles[i] = obstacles[obstacles.length - 1];
            obstacles.pop();
            i--;
        }
    }
    player.handleCollision(obstacles);

    if (player.count <= 0) {
        gameOver();
    }
}

function gameOver() { 
    togglePause();
}

function getDirection() {
    let direction = {
        up : false,
        down: false,
        left: false,
        right: false
    };
    direction.up = keys["ArrowUp"] || keys["w"];
    direction.down = keys["ArrowDown"] || keys["s"];
    direction.left = keys["ArrowLeft"] || keys["a"];
    direction.right = keys["ArrowRight"] || keys["d"];
    return direction;
}

function draw() {
    clearCanvas();
    drawBackground();
    for (let i = 0; i < obstacles.length; i++) {
        let obstacle = obstacles[i];
        if (obstacle.canDraw()) {
            obstacle.draw();
        }
    }   

    player.draw();
}

function drawBackground() {
    let background = imgDict["background2"];
    let startX = backgroundPos % background.width;
    for (let i = 0; i < baseWidth; i += (background.width - startX))
	{
        if (i > 0)
        {
            startX = 0;
        }
        ctx.drawImage(background, startX, 0, background.width - startX, background.height, i, 0, background.width - startX, background.height);
	}
}

function moveBackground() {
    backgroundPos += backgroundSpeed;
}

function clearCanvas() {
	ctx.clearRect(0, 0, baseWidth, baseHeight);
}


document.body.addEventListener("keydown", function(event)
{
	keys[event.key] = true;
});

document.body.addEventListener("keyup", function(event)
{
	keys[event.key] = false;
});

document.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      toggleFullScreen();
    }
  }, false);

function toggleFullScreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
    } else if (document.exitFullscreen) {
      document.exitFullscreen();
    }
  }

