var player;
var lastCalledTime;
var fps;
var paused = false;
var obstacles = [];

function loadAssets() {
	imgsToLoad.forEach(imgString => {
		let img = new Image();
		img.src = imgFolder + imgString + ".png";
		imgDict[imgString] = img;
	});

    for (const [ string, img ] of Object.entries(imgDict))
    {
        if(img.complete)
            incrementCounter();
        else
            img.addEventListener( 'load', incrementCounter, false );
    }
}
loadAssets();
function incrementCounter() {
    counter++;
    if ( counter === imgsToLoad.length ) {
        beginGame();
    }
}

function restartGame() {
    player = new Player();
    player.addPengus(5);
    obstacles = [];
    obstacles.push(new Gate(600, 0, 100, canvas.height, 10));
    obstacles.push(new Gate(1000, 0, 100, canvas.height, 2));
    obstacles.push(new Gate(2000, 0, 100, canvas.height, 2));
    obstacles.push(new Gate(3000, 0, 100, canvas.height, 2));
    obstacles.push(new Gate(4000, 0, 100, canvas.height, 2));
}

function beginGame() { 
    restartGame();
    requestAnimationFrame(loop);
}

function loop() {
    requestAnimationFrame(loop);
    if (paused)
	{
		if (keys["a"])
		{
			paused = false;
            restartGame();
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
    player.movePengus();
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
}

function draw() {
    
}

function clearCanvas() {
	ctx.clearRect(0, 0, canvas.width, canvas.height);
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

