import { Collider } from "./collider.js";
import { Obstacle, Gate, GateParent } from "./obstacle.js";
import { Player } from "./player.js";
import { Pengu } from "./pengu.js";
import { imgDict, canvas, ctx, baseWidth, baseHeight } from "./canvas.js";
var imgFolder = "assets/";
let imgsToLoad = ["right"];
let keys = [];

canvas.width = baseWidth;
canvas.height = baseHeight;

var player;
var lastCalledTime;
var fps;
var paused = false;
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
    player.addPengus(5);
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

function loop() {
    requestAnimationFrame(loop);
    if (paused)
	{
		if (keys["r"])
		{
			paused = false;
            loadLevel(1);
		}
		else
		{
			return;
		}
	}
    /*if(!lastCalledTime) {
        lastCalledTime = Date.now();
        fps = 0;
        return;
     }
     delta = (Date.now() - lastCalledTime)/1000;
     lastCalledTime = Date.now();
     fps = 1/delta;*/

    move();
    draw();
    
    clearCanvas();
    //ctx.fillStyle = "white";
    //ctx.fillRect(0,0, canvas.width, canvas.height);
    /*ctx.beginPath();
    ctx.fillStyle = "black";
    ctx.font = '48px serif';
    ctx.fillText('fps: ' + fps, 100, 500);*/
    for (let i = 0; i < obstacles.length; i++) {
        let obstacle = obstacles[i];
        if (obstacle.canDraw())
        {
            obstacle.draw();
        }
        obstacle.move();
        if (obstacle.isOut())
        {
            obstacles[i] = obstacles[obstacles.length - 1];
            obstacles.pop();
            i--;
        }
    }
    player.draw();
    processInputs();

    if (player.pengus.length <= 0) {
        gameOver();
    }
}

function gameOver() { 
    paused = true;
}

function move()
{
    player.movePengus(obstacles);
}

function processInputs() {
    if (keys["ArrowUp"] || keys["w"])
    {
        player.moveUp();
    }
    else if (keys["ArrowDown"] || keys["s"])
    {
        player.moveDown();
    }
    else if (keys["p"])
    {
        paused = true;
    }
}

function draw() {
    
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

