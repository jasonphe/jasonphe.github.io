var canvas = document.getElementById('game');
var context = canvas.getContext('2d');

const castleLevels = 5;
var stage = {x : 0, y : 0};
var defaultFriction = 0.8;
var gravity = 0.5;
var angle = 90;
var fps = 60;
var fpsInterval = 1000/fps;
var then = Date.now();
var keys = [];
var charger;
var startTime;
var paused = false;
var animationCounter = 0;
var animator = setInterval(function(){ animationCounter++;}, 100);
var counter = 0;
var drawText = none;
var hasDoidos = false;
var giftedDoidos = 0;
var performJump = false;
const imgFolder = "assets/";
var jumpSound = new Audio(imgFolder + "jumpSound.mp3");
var jumpSound2 = new Audio(imgFolder + "jumpSound2.mp3");
var yoshiSound = new Audio(imgFolder + "yoshi.mp3");
var imgDict = {};
loadAssets();
function loadAssets()
{
	let imgsToLoad = ["right", "left", "jumpleft", "jumpright", "wall1", "wall2", "torch", "window", "power", 
		"heart", "ice", "wood", "door", "ibis", "redPanda", "tpose", "yuyukos", "zucc", "sign",
		"monkey", "mochi", "yuumi", "josuke", "bigYoshi", "cloud1", "cloud2", "cloud3", "cloud4"];
	imgsToLoad.forEach(imgString => {
		let img = new Image();
		img.src = imgFolder + imgString + ".png";
		imgDict[imgString] = img;
	});
}

var platforms = [];
var objects = [];
var clouds = [];
var mp = 50; //max particles
var particles = [];

var platform_width = 180;
var platform_height = 15;
var allClouds = [];
var player;
var len = Object.keys(imgDict).length
var counter = 0;

for (const [ string, img ] of Object.entries(imgDict))
{
	if(img.complete)
      incrementCounter();
    else
      img.addEventListener( 'load', incrementCounter, false );
}

function incrementCounter() {
    counter++;
    if ( counter === len ) {
        SetProperties();
    }
}

function SetProperties()
{
	for(let i = 0; i < mp; i++)
	{
		particles.push({
			x: Math.random()*canvas.width, //x-coordinate
			y: Math.random()*canvas.height, //y-coordinate
			r: Math.random()*4+1, //radius
			d: Math.random()*mp //density
		})
	}
	allStages = [
		[
			//0,0
			{
				platforms: 
				[
					{
						type: "ice",
						x: 0,
						y: 550,
						width: 1024,
						height: 50,
					},
					{
						type: "ice",
						x: 0,
						y: 100,
						width: 400,
						height: platform_height,
					},
					{
						type: "ice",
						x: 700,
						y: 100,
						width: 100,
						height: platform_height,
					},
					{
						type: "wall2",
						x: 800,
						y: 0,
						width: 300,
						height: 550,
						intangible: true,
					},
				],
				objects:
				[
					{
						type: "heart",
						x: 730,
						y: 30,
						item: "secret"
					},
					{
						type: "door",
						x: 830,
						y: 390,
						stage: {x: 1, y: 0},
						newx: 200,
						newy: 500,
					},
					{
						type: "yuyukos",
						x: 600,
						y: 434,
					},
					{
						type: "sign",
						x: 150,
						y: 478,
						text: ["Use the left and right arrow keys to move."],
					},
					{
						type: "torch",
						x: 880,
						y: 30,
					},
					{
						type: "torch",
						x: 820,
						y: 250,
					},
					{
						type: "torch",
						x: 950,
						y: 250,
					},
				],
			},
			//0,1
			{
				platforms:
				[
					{
						type: "wall2",
						x: 800,
						y: 0,
						width: 300,
						height: canvas.height,
						intangible: true,
					},
				],
				objects:
				[
				],
			},
			//0,2
			{
				platforms:
				[
					{
						type: "wall2",
						x: 800,
						y: 0,
						width: 300,
						height: canvas.height,
						intangible: true,
					},
				],
				objects:
				[
				],
			},
			//0,3
			{
				platforms:
				[
					{
						type: "wall2",
						x: 800,
						y: 0,
						width: 300,
						height: canvas.height,
						intangible: true,
					},
				],
				objects:
				[
				],
			},
			//0,4
			{
				platforms:
				[
					{
						type: "wall2",
						x: 800,
						y: 0,
						width: 300,
						height: canvas.height,
						intangible: true,
					},
					{
						 x: 700,
						 y: 275,
						 width: 400,
						 height: platform_height,
					},
					{
						 x: 0,
						 y: 0,
						 width: canvas.width,
						 height: 30,
						 type: "invis",
					},
				],
				objects:
				[
					{
						type: "door",
						x: 950,
						y: 110,
						stage: {x: 1, y: 4},
						newx: 80,
						newy: 200,
					},
					{
						type: "heart",
						x: 750,
						y: 200,
						item: "monkey"
					},
				],
			},
			//0,5
			{
				platforms:
				[
					{
						type: "wall2",
						x: 800,
						y: 0,
						width: 300,
						height: canvas.height,
						intangible: true,
					},
				],
				objects:
				[
				],
			},
		],
		[
			//1,0
			{
				platforms:
				[
					{
						x: 750,
						y: 500,
						width: 300,
						height: platform_height,
				   },
				   {
						x: 250,
						y: 440,
						width: 400,
						height: platform_height,
				   },
				   {
						x: 500,
						y: 300,
						width: 400,
						height: platform_height,
				   },
				   {
						x: 200,
						y: 350,
						width: platform_width,
						height: platform_height,
				   },
				   {
						x: 0,
						y: 300,
						width: platform_width,
						height: platform_height,
				   },
				   {
						x: 650,
						y: 225,
						width: platform_width,
						height: platform_height,
				   },
				   {
						x: 250,
						y: 150,
						width: 300,
						height: platform_height,
				   },
				   {
						x: 50,
						y: 70,
						width: platform_width,
						height: platform_height,
				   },
				   {
					   x: 0,
					   y: 550,
					   width: canvas.width,
					   height: 30
				   },
				],
				objects:
				[
					{
						type: "door",
						x: 0,
						y: 390,
						stage: {x: 0, y: 0},
						newx: 750,
						newy: 500,
					},
					{
						type: "torch",
						x: 50,
						y: 25,
					},
					{
						type: "torch",
						x: 500,
						y: 225,
					},
					{
						type: "window",
						x: 700,
						y: 85,
					},
					{
						type: "torch",
						x: 400,
						y: 480,
					},
					{
						type: "heart",
						x: 400,
						y: 370,
						width: 40,
						height: 40,
						item: "ibis"
					},
					{
						type: "sign",
						x: 600,
						y: 480,
						text: ["Hold down the space bar to charge up a", "jump! The top left bar shows your jump power."],
					},
					{
						type: "sign",
						x: 500,
						y: 370,
						text: ["Hearts contain special objects that", "increase your jump power!"],
					},
					{
						type: "sign",
						x: 150,
						y: 0,
						text: ["Jump up to reach the next stage!"],
					},
				],
			},
			//1,1
			{
				platforms:
				[
					{
						x: 250,
						y: 550,
						width: 200,
						height: platform_height,
				   },
				   {
						x: 750,
						y: 550,
						width: 200,
						height: platform_height,
				   },
				   {
						x: 400,
						y: 500,
						width: 200,
						height: platform_height,
				   },
				   {
						x: 200,
						y: 425,
						width: 100,
						height: platform_height,
				   },
				   {
						x: 125,
						y: 400,
						width: 100,
						height: platform_height,
				   },
				   {
						x: 50,
						y: 375,
						width: 100,
						height: platform_height,
				   },
				   {
						x: 200,
						y: 300,
						width: 100,
						height: platform_height,
				   },
				   {
						x: 350,
						y: 300,
						width: 100,
						height: platform_height,
				   },
				   {
						x: 500,
						y: 270,
						width: 100,
						height: platform_height,
				   },
				   {
						x: 750,
						y: 230,
						width: 300,
						height: platform_height,
				   },
				   {
						x: 900,
						y: 180,
						width: 100,
						height: platform_height,
				   },
				   {
						x: 50,
						y: 100,
						width: 800,
						height: platform_height,
				   },
				],
				objects:
				[
					{
						type: "heart",
						x: 70,
						y: 30,
						item: "tpose"
					},
					{
						type: "torch",
						x: 450,
						y: 425,
					},
					{
						type: "torch",
						x: 700,
						y: 300,
					},
					{
						type: "torch",
						x: 450,
						y: 200,
					},
					{
						type: "window",
						x: 190,
						y: 162,
					},
					{
						type: "heart",
						x: 850,
						y: 480,
						item: "bigYoshi"
					},
				],
			},
			//1,2
			{
				platforms:
				[
					{
						x: 200,
						y: 550,
						width: 250,
						height: platform_height,
				   },
				   {
						x: 450,
						y: 325,
						width: 50,
						height: 270,
				   },
				   {
						x: 450,
						y: 0,
						width: 50,
						height: 200,
				   },
				   {
						x: 250,
						y: 0,
						width: 50,
						height: 480,
				   },
				   {
						x: 300,
						y: 450,
						width: 70,
						height: platform_height,
				   },
				   {
						x: 380,
						y: 350,
						width: 70,
						height: platform_height,
				   },
				   {
						x: 300,
						y: 250,
						width: 70,
						height: platform_height,
				   },
				   {
						x: 380,
						y: 150,
						width: 70,
						height: platform_height,
				   },
				   {
						x: 300,
						y: 50,
						width: 70,
						height: platform_height,
				   },
				   {
						x: 500,
						y: 325,
						width: 200,
						height: platform_height,
				   },
				   {
						x: 800,
						y: 300,
						width: 100,
						height: platform_height,
				   },
				],
				objects:
				[
					{
						type: "torch",
						x: 575,
						y: 225,
					},
					{
						type: "torch",
						x: 350,
						y: 125,
					},
					{
						type: "window",
						x: 790,
						y: 160,
					},
					{
						type: "heart",
						x: 825,
						y: 230,
						item: "mochi"
					},
					{
						type: "sign",
						x: 450,
						y: 260,
						text: ["ZUCC wuz here"],
					},
				],
			},
			//1,3
			{
				platforms:
				[
					{
						x: 450,
						y: 530,
						width: 50,
						height: 100,
				   },
				   {
						x: 250,
						y: 530,
						width: 50,
						height: 100,
				   },
				   {
						x: 50,
						y: 530,
						width: 200,
						height: platform_height,
				   },
				   {
						x: 0,
						y: 450,
						width: 150,
						height: platform_height,
				   },
				   {
						x: 500,
						y: 530,
						width: 200,
						height: platform_height,
				   },
				   {
						x: 850,
						y: 530,
						width: 200,
						height: platform_height,
				   },
				   {
						x: 850,
						y: 420,
						width: 100,
						height: platform_height,
				   },
				   {
						x: 300,
						y: 400,
						width: 550,
						height: platform_height,
				   },
				   {
						x: 100,
						y: 300,
						width: 250,
						height: platform_height,
				   },
				   {
						x: 850,
						y: 200,
						width: 100,
						height: platform_height,
				   },
				   {
						x: 600,
						y: 100,
						width: 150,
						height: platform_height,
				   },
				   {
						x: 800,
						y: 300,
						width: 250,
						height: platform_height,
				   },
				],
				objects:
				[
					{
						type: "torch",
						x: 350,
						y: 450,
					},
					{
						type: "torch",
						x: 900,
						y: 350,
					},
					{
						type: "zucc",
						x: 100,
						y: 180,
					},
					{
						type: "heart",
						x: 750,
						y: 430,
						item: "yuumi"
					},
					{
						type: "heart",
						x: 875,
						y: 120,
						item: "redPanda"
					},
				],
			},
			//1,4
			{
				platforms:
				[
					{
						x: 750,
						y: 550,
						width: 200,
						height: platform_height,
				   },
				   {
						x: 350,
						y: 450,
						width: 200,
						height: platform_height,
				   },
				   {
						x: 0,
						y: 275,
						width: 200,
						height: platform_height,
				   },
				],
				objects:
				[
					{
						type: "door",
						x: -100,
						y: 110,
						stage: {x: 0, y: 4},
						newx: 900,
						newy: 200,
					},
					{
						type: "torch",
						x: 825,
						y: 470,
					},
					{
						type: "heart",
						x: 650,
						y: 275,
						item: "josuke"
					},
				],
			},
			//1,5
			{
				platforms:
				[
				],
				objects:
				[
				],
			},
		],
	];

player = {
	x: 150,
	y: 400,
	width: 40,
	height: 40,
	speed: 5,
	velX: 0,
	velY: 0,
	color: "#ff0000",
	charging: false,
	jumping: false,
	grounded: false,
	maxJumpStrength: 5,
	hearts: 0,
	jumpStrength: 0,
	position: "right",
	draw: function(){	
		
		let imgType = this.position;
		let animate = player.velX > 1 || player.velX < -1 || player.jumping || player.charging;
		if (player.jumping || player.charging)
		{
			imgType = "jump" + imgType;
		}
		
		let img = imgDict[imgType];
		if (animate)
		{
			let total = 20;
			if (counter % total < (total/2))
			{
				startX = 1;
			}
			else 
			{
				startX = 0;
			}
			counter++;
		}
		else
		{
			startX = 0;
			counter = 0;
		}
		context.drawImage(img, startX * 40, 0, 40, 40, this.x, this.y, 40, 40);
	}
}

startGame();
};

function startGame()
{
	for (let i = 0; i < allStages.length; i++)
	{
		for (let j = 0; j < allStages[i].length; j++)
		{
			addSideWalls(allStages[i][j].platforms);
			if (isCoordOutside(i, j))
			{
				allStages[i][j].clouds = addClouds();
			}
			else
			{
				allStages[i][j].clouds = [];
			}
		}
	}
	
	loadStage();
	requestAnimationFrame(loop);
}

function startTimer()
{
	startTime = Date.now();
	setInterval(function() {
		var delta = Date.now() - start; // milliseconds elapsed since start
		output(Math.floor(delta / 1000)); // in seconds
		// alternatively just show wall clock time:
		//output(new Date().toUTCString());
	}, 1000); // update about every second
}

function addSideWalls(platforms)
{
	platforms.push({
			x: -10,
			y: 0,
			width: 10,
			height: canvas.height,
			type: "invis"
		});
	platforms.push({
			x: canvas.width,
			y: 0,
			width: 10,
			height: canvas.height,
			type: "invis"
		});
}

function loadStage()
{
	try 
	{
		let currStage = allStages[stage.x][stage.y];
		platforms = currStage.platforms;
		objects = currStage.objects;
		clouds = currStage.clouds;
	}
	catch (error)
	{
		platforms = [];
		addSideWalls(platforms);
		objects = [];
		clouds = [];
	}
}

function setStage(newStage)
{
	stage = newStage;
	loadStage();
}


function addClouds()
{
	let newClouds = [];
	for (let i = 1; i <= 4; i++)
	{
		newClouds.push({
			type: "cloud" + (i % 5),
			x: Math.random() * 600,
			y: Math.random() * (canvas.height - 200),
			});
	}
	return newClouds;
}

document.body.addEventListener("keydown", function(event)
{
	keys[event.keyCode] = true;
});

document.body.addEventListener("keyup", function(event)
{
	keys[event.keyCode] = false;
	if (event.keyCode == 32)
	{
		stopCharging();
		performJump = true;
	}
});

function stopCharging()
{
	clearInterval(charger);
	player.charging = false;
}

function jump()
{
	if (player.jumpStrength > 0)
	{
		player.jumping = true;
		player.velY = - 5 - player.jumpStrength * .8;
		if (player.position == "left")
		{
			player.velX = -4 - player.jumpStrength * .2;
		}
		else
		{
			player.velX = 4 + player.jumpStrength * .2;
		}
		
		let jumpSoundClone;
		if (player.jumpStrength == player.maxJumpStrength)
		{
			jumpSoundClone = jumpSound2.cloneNode();
		}
		else
		{
			jumpSoundClone = jumpSound.cloneNode();
		}
		jumpSoundClone.volume = 0.3;
		jumpSoundClone.play();
	}
	player.jumpStrength = 0;
	performJump = false;
}

function drawPlatforms()
{
	for(let i = 0; i < platforms.length; i++)
	{
		let platform = platforms[i];
		let platformInfo = getPlatformInfo(platform);
		let platformImg = platformInfo.platformImg;
		if (platformInfo.secondaryColor == "invis")
		{
			continue;
		}
		
		context.fillStyle = platformInfo.secondaryColor;
		context.fillRect(platform.x + 5, platform.y, platform.width - 10, platform.height + 5);
		
		let right = platform.x + platform.width;
		let bottom = platform.y + platform.height;
		for (let i = platform.x; i < right; i += platformImg.width)
		{
			for (let j = platform.y - 2; j < bottom; j+= platformImg.height)
			{
				let drawWidth = Math.min(right- i, platformImg.width);
				let drawHeight = Math.min(bottom - j, platformImg.height);
				context.drawImage(platformImg, 0, 0, drawWidth, drawHeight, i, j, drawWidth, drawHeight);
			}
		}
	}
}

function drawObjects()
{
	for(let i = 0; i < objects.length; i++)
	{
		let object = objects[i];
		let objectImg = imgDict[object.type];
		switch (object.type)
		{
			case "torch":
			{
				context.drawImage(objectImg, ((animationCounter + i) % 3) * 40, 0, 40, 40, object.x, object.y, 40, 40);
				break;
			}
			case "heart":
			{
				let movement = (animationCounter% 10) - 5;
				context.drawImage(objectImg, object.x, object.y + Math.abs(movement));
				break;
			}
			default:
			{
				context.drawImage(objectImg, object.x, object.y);
				break;
			}
		}
	}
}

function drawBackground()
{
	//outside
	if (stage.x != 1)
	{
		context.fillStyle = "#87CEEB";
		context.fillRect(0, 0, canvas.width, canvas.height);
		return;
	}
	
	//in castle
	let img = imgDict["wall1"];
	for (let i = 0; i < canvas.width; i += img.width)
	{
		for (let j = 0; j < canvas.height; j+= img.height)
		{
			context.drawImage(img, i, j);
		}
	}
}

function drawClouds()
{
	for(let i = 0; i < clouds.length; i++)
	{
		let cloud = clouds[i];
		context.drawImage(imgDict[cloud.type], cloud.x, cloud.y, 150, 100);
	}
}

function drawJumpPower()
{
	//draw bar
	let boxHeight = player.maxJumpStrength * 10;
	let bottomBar = 150;
	let topBar = 150 - boxHeight;
	context.fillStyle = "#0000ff";
	context.fillRect(20, topBar, 30, boxHeight);
	context.drawImage(imgDict["power"], 15, bottomBar + 5);
	
	//draw charged part
	let size = player.jumpStrength * 10;
	context.fillStyle = "#ff0000";
	context.fillRect(20, bottomBar - size, 30, size);
}

function chargeJump()
{
	player.jumpStrength += .25;
	player.jumpStrength = Math.min(player.jumpStrength, player.maxJumpStrength);
}

function isOutside()
{
	return isCoordOutside(stage.x, stage.y);
}
function isCoordOutside(x,y)
{
	return x != 1;
}

function drawSnow()
{
	if (!isOutside())
	{
		return;
	}
	context.fillStyle = "rgba(255, 255, 255, 0.8)";
	context.beginPath();
	for(let i = 0; i < mp; i++)
	{
		let p = particles[i];
		context.moveTo(p.x, p.y);
		context.arc(p.x, p.y, p.r, 0, Math.PI*2, true);
	}
	context.fill();
}

function updateSnow()
{
	//angle += 0.01;
	for(var i = 0; i < mp; i++)
	{
		var p = particles[i];
		let W = canvas.width;
		let H = canvas.height;
		//Updating X and Y coordinates
		//We will add 1 to the cos function to prevent negative values which will lead flakes to move upwards
		//Every particle has its own density which can be used to make the downward movement different for each flake
		//Lets make it more random by adding in the radius
		p.y += Math.cos(angle+p.d) + 1 + p.r/2;
		p.x += Math.sin(angle) * 2;
		
		//Sending flakes back from the top when it exits
		//Lets make it a bit more organic and let flakes enter from the left and right also.
		if(p.x > W+5 || p.x < -5 || p.y > H)
		{
			if(i%3 > 0) //66.67% of the flakes
			{
				particles[i] = {x: Math.random()*W, y: -10, r: p.r, d: p.d};
			}
			else
			{
				//If the flake is exitting from the right
				if(Math.sin(angle) > 0)
				{
					//Enter from the left
					particles[i] = {x: -5, y: Math.random()*H, r: p.r, d: p.d};
				}
				else
				{
					//Enter from the right
					particles[i] = {x: W+5, y: Math.random()*H, r: p.r, d: p.d};
				}
			}
		}
	}
}

function changeStage()
{
	if (player.y <= 0)
	{
		setStage({x: stage.x, y: stage.y + 1});
		player.y = canvas.height - player.height;
	}
	else if (player.y + player.height >= canvas.height)
	{
		setStage({x: stage.x, y: stage.y - 1});
		player.y = 0;
	}
}

function draw()
{
	clearCanvas();
	drawBackground();
	drawClouds();
	drawPlatforms();
	drawObjects();
	drawSnow();
	drawText();
	drawText = none;
	player.draw();
	drawJumpPower();	
}
var lastRender = Date.now();
function loop(timestamp)
{
	requestAnimationFrame(loop);
	if (paused)
	{
		if (keys[13])
		{
			paused = false;
		}
		else
		{
			return;
		}
	}

	let progress = timestamp - lastRender;
	
	draw();
	update(progress);
	lastRender = timestamp;
}

function update(progress)
{
	/*Limit the frame rate
	now = Date.now();
	let elapsed = now - then;
	if (elapsed <= fpsInterval)
	{
		return;
	}
	then = now - (elapsed % fpsInterval);*/
	itemCollisionCheck();
	updateSnow();
	changeStage();
	let grounded = false;
	let platformFriction = defaultFriction;
	for(var i = 0; i < platforms.length; i++){
		let platform = platforms[i];
		var direction = platformCollisionCheck(platform);

		if(direction == "left" || direction == "right"){
			player.velX *= -.4;
		} else if(direction == "bottom"){
			player.jumping = false;
			grounded = true;
			platformFriction = getPlatformInfo(platform).friction;
		} else if(direction == "top"){
			player.velY = 0;
		}
	}
	player.grounded = grounded;

	if (player.grounded)
	{
		player.velX *= platformFriction;
		player.velY = 0;
		player.jumping = false;
	}
	else
	{
		player.velY += gravity;
		player.velY = Math.min(10, player.velY);
		stopCharging();
		player.jumpStrength = 0;
	}

	if(keys[32] && !player.charging && player.grounded)
	{
		player.charging = true;
		charger = setInterval(chargeJump, 25);
	}

	if (performJump)
	{
		jump();
	}
	
	if (player.grounded && player.jumpStrength == 0 && !player.jumping)
	{
		if(keys[39] || keys[68]){
			player.position = "right";
			player.velX+=2;
			player.velX = Math.min(player.velX, player.speed);
		}

		if(keys[37] || keys[65]){
			player.position = "left";
			player.velX-=2;
			player.velX = Math.max(player.velX, -player.speed);
		}
	}

	player.x += player.velX;
	player.y += player.velY;
}

function platformCollisionCheck(platform)
{
	if ("intangible" in platform && platform.intangible)
	{
		return;
	}
	var collisionDirection = null;
	var vectorX = (player.x + (player.width/2)) - (platform.x + (platform.width/2));
	var vectorY = (player.y + (player.height/2)) - (platform.y + (platform.height/2));

	var halfWidths = (player.width/2) + (platform.width/2);
	var halfHeights = (player.height/2) + (platform.height/2);

	if(Math.abs(vectorX) <= halfWidths && Math.abs(vectorY) <= halfHeights){

		var offsetX = halfWidths - Math.abs(vectorX);
		var offsetY = halfHeights - Math.abs(vectorY);
		if(offsetX < offsetY){

			if (vectorX > 0 && player.velX < 0){
				collisionDirection = "left";
				player.x += offsetX;
			} else if (player.velX > 0){
				collisionDirection = "right";
				player.x -= offsetX;
			}

		} else {

			if (vectorY > 0){
				collisionDirection = "top";
				player.y += offsetY;
			} else {
				collisionDirection = "bottom";
				player.y -= offsetY;
			}

		}

	}

	return collisionDirection;
}

function itemCollisionCheck()
{
	for (let i = 0; i < objects.length; i++)
	{
		let object = objects[i];
		if (intersectObject(player, object))
		{
			switch (object.type)
			{
				case "heart":
				{
					player.hearts++;
					player.maxJumpStrength = Math.max(player.maxJumpStrength, 5 + player.hearts);
					objects.splice(i, 1);
					itemPickup(object.item);
					break;
				}
				case "door":
				{
					player.x = object.newx;
					player.y = object.newy;
					player.velX = 0;
					player.velY = 0;
					setStage(object.stage);
					break;
				}
				case "yuyukos":
				{
					if (!hasDoidos)
					{
						drawText = function() {
							drawSpeech(object, ["Hey! A stupid monkey stole my stuff", "and climbed to the top of the castle.", "Can you get him down for me?"]);
						};
					}
					else
					{
						if (giftedDoidos < 700)
						{
							drawText = function() {
								drawSpeech(object, ["MY DOIDOS!!!!!!!!!! THANK YOU SO MUCH!", "You can keep the monkey."]);
							};
						}
						else 
						{
							drawText = function() {
								drawSpeech(object, ["What the hell are you still doing here?", "You've got all you could get here."]);
							};
							
						}
						giftedDoidos++;
					}
					break;
				}
				case "zucc":
				{
					
					if (giftedDoidos == 0)
					{
						drawText = function() {
							drawSpeech(object, ["Howdy! You jump quite high!", "Is that your quirk??"]);
						};
					}
					else
					{
						drawText = function() {
							drawSpeech(object, ["Hey you came back to visit!", "Nice monkey you got there.", "You've already won by the way."]);
						};
					}
					break;
				}
				case "sign":
				{
					drawText = function() {
						drawSpeech(object, object.text);
					};
					break;
				}
			}
		}
	}
}

function getPlatformInfo(platform)
{
	let platformType = "wood";
	if (("type" in platform))
	{
		platformType = platform.type;
	}
	let platformInfo = 
	{ 
		platformImg : imgDict[platformType],
		secondaryColor : "#000000",
		friction : defaultFriction,
	}
	switch (platformType)
	{
		case "invis":
		{
			platformInfo.secondaryColor = "invis";
			break;
		}
		case "ice":
		{
			platformInfo.secondaryColor = "#907020";
			platformInfo.friction = 0.95;
			break;
		}
	}
	return platformInfo;
}

function itemPickup(item)
{
	let text1 = "";
	let text2 = "";
	let itemImg = imgDict[item];
	let continueText = "Press Enter to continue...";
	switch (item)
	{
		case "ibis":
		{
			text1 = "You open the heart to find a bin chicken (ibis) digging in the trash.";
			text2 = "For some reason you feel like you can jump slightly higher.";
			break;
		}
		case "tpose":
		{
			text1 = "It's Aphelios T-posing... ";
			text2 = "You T-pose in response to assert dominance.";
			break;
		}
		case "redPanda":
		{
			text1 = "You find a red panda!";
			text2 = "You feel energized by its cuteness.";
			break;
		}
		case "monkey":
		{
			text1 = 'You reach the top and find a monkey holding a pair of shorts with "Doidos" written on them. ';
			text2 = "The monkey seems to have taken a liking to you. He hands you the shorts and follows you.";
			hasDoidos = true;
			break;
		}
		case "secret":
		{
			text1 = "Wow! Great job! You found the secret heart!";
			text2 = "It's a bin chicken as well...";
			break;
		}
		case "yuumi":
		{
			text1 = "You found Yuumi! She hops onto you.";
			text2 = "You feel almost invincible. How do you even lose with Yuumi?";
			break;
		}
		case "mochi":
		{
			text1 = "You found some mochi! Yum!";
			text2 = "Eating the mochi makes you feel better.";
			break;
		}
		case "bigYoshi":
		{
			text1 = "You found Big Yoshi!!!";
			text2 = "He plays you some sick jams.";
			yoshiSound.currentTime = 0;
			yoshiSound.volume = .1;
			yoshiSound.play();
			break;
		}		
		case "josuke":
		{
			text1 = "CRAZY DIAMOND!!!";
			text2 = "The stand heals all injuries you may have sustained from falling hundreds of feet.";
			break;
		}
	}
	
	context.fillStyle = "#FFEBCD";
	context.fillRect(30, 450, 950, 100);
	context.fillStyle = "black";
	context.font = "15px Arial";
	context.fillText(text1, 40, 475);
	context.fillText(text2, 40, 500);
	context.fillText(continueText, 40, 525);
	context.fillStyle = "red";
	let imgWidth = itemImg.width;
	let imgHeight = itemImg.height;
	let centeredX = (canvas.width - imgWidth -20) / 2;
	let centeredY = (450 - imgHeight - 20) / 2;
	context.fillRect(centeredX, centeredY, imgWidth + 20, imgHeight + 20);
	context.drawImage(itemImg, centeredX + 10, centeredY + 10);
	paused = true;
}

function intersectObject(a, object)
{
	let img = imgDict[object.type];
	return intersect(a, {x: object.x, y: object.y, width: img.width, height: img.height});
}

function intersect(a, b)
{
  return (a.x <= (b.x + b.width) &&
          b.x <= (a.x + a.width) &&
          a.y <= (b.y + b.height) &&
          b.y <= (a.y + a.height));
}

function clearCanvas()
{
	context.clearRect(0, 0, canvas.width, canvas.height);
}

function drawSpeech(object, text)
{
	let img = imgDict[object.type];
	let backHeight = 5;
	let widestText = 0;
	let fontHeight = 15;
	context.font = fontHeight + "px Arial";
	for (let i = 0; i < text.length; i++)
	{
		backHeight += fontHeight;
		let textWidth = context.measureText(text[i]).width;
		if (textWidth > widestText)
		{
			widestText = textWidth;
		}
	}
	
	backHeight = 5 + (text.length * 15);
	
	let backWidth = widestText + 10;
	let xRect = object.x - ((backWidth - img.width) / 2);
	let yRect = Math.max(0, object.y - 5 - backHeight);
	context.fillStyle = "#FFEBCD";
	context.fillRect(xRect, yRect, backWidth, backHeight);
	context.fillStyle = "black";
	for (let i = 0; i < text.length; i++)
	{
		context.fillText(text[i], xRect + 5, yRect + ((i+1) * fontHeight));
	}
}

function none(){}