import { Collider } from "./collider.js";
import { Obstacle, Gate, GateParent } from "./obstacle.js";
import { Player } from "./player.js";
//import { Pengu } from "./pengu.js";
import { imgDict, audioDict, canvas, ctx, baseWidth, baseHeight, oldTimeStamp, setTimestamp } from "./globals.js";
import { loadAssets, levelsObj } from "./preload.js"

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
var isGameOver = false;
var currentLevel = 1;
var levelButtons = [];
const levelsPerRow = 6;
const levelsPerColumn = 3;
var mousePosition = {x: 0, y: 0};
var clickPosition = {x: 0, y: 0, clicked: false};

loadAssets(levelSelect);

function levelSelect() {
    setLevelButtons();
    menuLoop();
}

function menuLoop() {
    //console.log(mousePosition.x + " " + mousePosition.y);
    if (clickPosition.clicked === true) {
        clickPosition.clicked = false;
        for (let i = 0; i < levelButtons.length; i++) {
            if (isHovering(clickPosition, levelButtons[i])) {
                currentLevel = i + 1;
                beginGame();
                return;
            }
        };
    }
    drawLevelSelect();
    requestAnimationFrame(menuLoop);
}

function isHovering(pos, button) {
    return (pos.x > button.x) && (pos.x < button.x + button.w)
        && (pos.y > button.y) && (pos.y < button.y + button.h);
}

function setLevelButtons() {
    levelButtons = [];
    let levelCount = levelsObj.levels.length;
    let levelIndex = 0;
    let marginSize = (baseWidth / (levelsPerRow + 1)) * .2;
    let spacePerButton = (baseWidth - ((levelsPerRow + 1) * marginSize)) / levelsPerRow;
    let currY = 0;
    for (let i = 0; i < levelsPerColumn; i++) {
        let currX = 0;
        currY += marginSize;
        for (let j = 0; j < levelsPerRow; j++) {
            if (levelIndex >= levelCount) {
                return;
            }
            
            currX += marginSize;
            levelButtons.push({x: currX, y: currY, w: spacePerButton, h: spacePerButton, 
                text: levelsObj.levels[levelIndex].title});            
            currX += spacePerButton;
            levelIndex++;
        }
        currY += spacePerButton;
    }
}
canvas.addEventListener("mousemove", (event) => {
    mousePosition = {x: event.offsetX, y: event.offsetY};
});
canvas.addEventListener('click', (event) => {
    clickPosition = {x: event.offsetX, y: event.offsetY, clicked: true};
});

function drawLevelSelect() {
    clearCanvas();
    levelButtons.forEach(b => {
        ctx.beginPath();
        ctx.fillStyle = "#1CE5DE";
        ctx.strokeStyle = isHovering(mousePosition, b) ? "red" : "black";
        ctx.lineWidth = 10;
        ctx.roundRect(b.x, b.y, b.w, b.h, 25);
        ctx.fill();
        ctx.stroke();

        ctx.beginPath();
        ctx.lineWidth = 3;
        ctx.font = "600 20pt Verdana";
        let displayText = b.text;
        ctx.textAlign="center";
        ctx.textBaseline = "middle"; 
        ctx.fillStyle = 'white';
        ctx.strokeStyle = 'black';
        ctx.fillText(displayText, b.x + b.w/2, b.y + b.h/2);
        ctx.strokeText(displayText, b.x + b.w/2, b.y + b.h/2);
    });
}

function beginGame() { 
    loadLevel(currentLevel);
    requestAnimationFrame(loop);
}

function loadLevel(level) {
    isGameOver = false;
    player = new Player();
    let levelIndex = level - 1;
    obstacles = [];
    levelsObj.levels[levelIndex].gateParents.forEach(element => {
        let gateParent = new GateParent(element.x, element.gates)
        obstacles = obstacles.concat(gateParent.gates);
    });
}

function togglePause() {
    paused = !paused;
    canTogglePause = false;
    setTimeout(()=> { canTogglePause = true; }, 300);
}

function loop(timeStamp) {
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
        displayPauseMenu();
		if (keys["r"]) {
            togglePause();
            loadLevel(currentLevel);
            return;
		} else if (keys["m"]) {
            togglePause();
            levelSelect();
            return;
		}
	}
    else {
        update(elapsedMS);
        draw();    
    }
    
    if ((keys["p"] || keys["Escape"]) && canTogglePause && !isGameOver) {
        togglePause();
    }
    //to do cancelAnimationFrame
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

function displayPauseMenu() {
    let menuDimensions = { width: 400, height: 600};
    
    ctx.beginPath();
    ctx.fillStyle = "#1CE5DE";
    ctx.strokeStyle = "black";
    ctx.lineWidth = 10;
    ctx.roundRect(baseWidth/2 - menuDimensions.width/2, baseHeight/2 - menuDimensions.height/2, menuDimensions.width, menuDimensions.height, 25);
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.lineWidth = 3;
    ctx.font = "600 30pt Verdana";
    let displayText = isGameOver ? "GAME OVER!" : "PAUSED";
    ctx.textAlign="center";
    ctx.textBaseline = "middle"; 
    ctx.fillStyle = 'white';
    ctx.strokeStyle = 'black';
    ctx.fillText(displayText, baseWidth/2, baseHeight/2);
    ctx.strokeText(displayText, baseWidth/2, baseHeight/2);
    //ctx.fill();
    //ctx.stroke();

    /*ctx.fillStyle = "orange";
    ctx.textAlign="center";
    ctx.textBaseline = "middle";
    ctx.fillText("PAUSED", baseWidth/2, baseHeight/2);*/
}

function gameOver() {
    setTimeout(()=> { audioDict["lose.wav"].cloneNode(true).play(); }, 500);
    isGameOver = true;
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

