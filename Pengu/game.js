import { Collider } from "./collider.js";
import { Obstacle, Gate, GateParent, FinishLine } from "./obstacle.js";
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
var isLose = false;
var isWin = false;
var currentLevel = 1;
var levelButtons = [];
const levelsPerRow = 6;
const levelsPerColumn = 3;
var mousePosition = {x: 0, y: 0};
var menuLoopReq;
var gameLoopReq;
var storedLevels = [{unlocked: true, highScore: 0}];
//var isTouch = true;//isTouchDevice();

loadAssets(init);

function init() {
    let storage = JSON.parse(localStorage.getItem("levels"));
    if (!storage || storage.length === 0 || storage[0].unlocked === false) {
        storage = storedLevels;
    } else {
        storedLevels = storage;
    }
    
    levelSelect();
}

function levelSelect() {
    setLevelButtons();
    canvas.addEventListener('click', menuClick);
    menuLoopReq = requestAnimationFrame(menuLoop);
}

function menuClick(event) {
    for (let i = 0; i < levelButtons.length; i++) {
        if (isHovering({x: event.offsetX, y: event.offsetY}, levelButtons[i]) && levelButtons[i].unlocked) {
            currentLevel = i + 1;
            cancelAnimationFrame(menuLoopReq);
            canvas.removeEventListener('click', menuClick);
            beginGame();
        }
    }
}

function menuLoop() {
    drawLevelSelect();
    menuLoopReq = requestAnimationFrame(menuLoop);
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
            let unlocked = storedLevels.length > levelIndex && storedLevels[levelIndex].unlocked;
            let highScore = unlocked ? storedLevels[levelIndex].highScore : 0;
            let levelTitle = levelsObj.levels[levelIndex].title;
            levelButtons.push({x: currX, y: currY, w: spacePerButton, h: spacePerButton, 
                text: levelTitle, unlocked: unlocked, highScore: highScore});            
            currX += spacePerButton;
            levelIndex++;
        }
        currY += spacePerButton;
    }
}
canvas.addEventListener("mousemove", (event) => {
    mousePosition = {x: event.offsetX, y: event.offsetY};
});

function drawLevelSelect() {
    clearCanvas();
    levelButtons.forEach(b => {
        ctx.beginPath();
        ctx.fillStyle = "#1CE5DE";
        ctx.strokeStyle = isHovering(mousePosition, b) && b.unlocked ? "red" : "black";
        ctx.lineWidth = 10;
        ctx.roundRect(b.x, b.y, b.w, b.h, 25);
        ctx.fill();
        ctx.stroke();

        ctx.beginPath();
        ctx.lineWidth = 3;
        ctx.font = "600 20pt Verdana";
        let displayText = b.unlocked ? b.text : "LOCKED";
        ctx.textAlign="center";
        ctx.textBaseline = "middle"; 
        ctx.fillStyle = 'white';
        ctx.strokeStyle = 'black';
        ctx.fillText(displayText, b.x + b.w/2, b.y + b.h/2 - 20);
        ctx.strokeText(displayText, b.x + b.w/2, b.y + b.h/2 - 20);

        if (b.unlocked) {
            ctx.beginPath();
            let scoreText = "Best: " + b.highScore;
            ctx.textAlign="center";
            ctx.textBaseline = "middle"; 
            ctx.fillStyle = 'white';
            ctx.strokeStyle = 'black';
            ctx.fillText(scoreText, b.x + b.w/2, b.y + b.h/2 + 20);
            ctx.strokeText(scoreText, b.x + b.w/2, b.y + b.h/2 + 20);
        }
    });
}

function beginGame() { 
    loadLevel(currentLevel);
    setTimestamp(undefined);
    addEventListener("blur", onBlur);
    gameLoopReq = requestAnimationFrame(gameLoop);
}

function loadLevel(levelNum) {
    isLose = false;
    isWin = false;
    player = new Player();
    let levelIndex = levelNum - 1;
    let level = levelsObj.levels[levelIndex];
    obstacles = [];
    level.gateParents.forEach(element => {
        let gateParent = new GateParent(element.x, element.gates)
        obstacles = obstacles.concat(gateParent.gates);
    });

    obstacles.push(new FinishLine(level.finish.x));
}
/*
function touchHandler(e) {
    if (e.touches) {
        touchPosition.x = e.touches[0].pageX;
        touchPosition.y = e.touches[0].pageY;
        touchPosition.touch = true;
    } else {
        touchPosition.touch = false;
    }
}*/

function togglePause(isPause) {
    setTimestamp(undefined);
    paused = isPause;
    canTogglePause = false;
    setTimeout(()=> { canTogglePause = true; }, 300);
}

function gameLoop(timeStamp) {
    /*if(!lastCalledTime) {
        lastCalledTime = Date.now();
        fps = 0;
        return;
     }
     delta = (Date.now() - lastCalledTime)/1000;
     lastCalledTime = Date.now();
     fps = 1/delta;*/
    if (oldTimeStamp == null) {
        setTimestamp(timeStamp);
    }
    let elapsedMS = timeStamp - oldTimeStamp;
    setTimestamp(timeStamp);
    
    if (paused) {
        displayPauseMenu();
		if (keys["r"]) {
            togglePause(false);
            cancelAnimationFrame(gameLoopReq);
            endGame();
            beginGame(currentLevel);
            return;
		} else if (keys["m"]) {
            togglePause(false);
            endGame()
            levelSelect();
            return;
		}
	}
    else {
        update(elapsedMS);
        draw();    
    }
    
    if ((keys["p"] || keys["Escape"]) && canTogglePause && !isLose && !isWin) {
        togglePause(!paused);
    }
    
    gameLoopReq = requestAnimationFrame(gameLoop);
}

function onBlur() { 
    togglePause(true);
}

function endGame() {
    removeEventListener("blur", onBlur);
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

    if (player.lose) {
        lose();
    } else if (player.win) {
        win();
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

    let displayText = "PAUSED";
    if (isLose) {
        displayText = "GAME OVER!";
    } else if (isWin) {
        displayText = "YOU WON!";
    }
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

function lose() {
    setTimeout(()=> { audioDict["lose.wav"].cloneNode(true).play(); }, 500);
    isLose = true;
    togglePause(true);
}

function win() {
    setTimeout(()=> { audioDict["win.wav"].cloneNode(true).play(); }, 500);
    isWin = true;
    saveToStorage({unlocked: true, highScore: player.count});
    togglePause(true);
}

function saveToStorage(save) {
    for (let i = storedLevels.length; i <= currentLevel; i++) {
        storedLevels.push({unlocked: true, highScore: 0});
    }
    if (save.highScore > storedLevels[currentLevel - 1].highScore) {
        storedLevels[currentLevel - 1] = save;
    }
    localStorage.setItem("levels", JSON.stringify(storedLevels));
}

function getDirection() {
    let cb = function (obj){
         return obj == null ? false : obj;
    };
    let direction = {
        up: cb(keys["ArrowUp"] || keys["w"]),
        down: cb(keys["ArrowDown"] || keys["s"]),
        left: cb(keys["ArrowLeft"] || keys["a"]),
        right: cb(keys["ArrowRight"] || keys["d"])
    };
    /*
    if (isTouch && touchPosition.touch && 
        Object.values(direction).every(value => value === false)) {
        direction.up = touchPosition.y < player.y;
        direction.down = touchPosition.y > player.y + player.h;
        direction.left = touchPosition.x < player.x;
        direction.right = touchPosition.x > player.x + player.w;
    }*/

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

document.addEventListener("keydown", function(event)
{
	keys[event.key] = true;
});

document.addEventListener("keyup", function(event)
{
	keys[event.key] = false;
});
/*
if (isTouch) {
    document.addEventListener("touchstart", touchHandler);
    document.addEventListener("touchmove", touchHandler);
}

function isTouchDevice() {
    return (('ontouchstart' in window) ||
        (navigator.maxTouchPoints > 0) ||
        (navigator.msMaxTouchPoints > 0));
}*/
