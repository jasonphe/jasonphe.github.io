import { Collider } from "./collider.js";
import { imgDict, audioDict, canvas, ctx, baseWidth, baseHeight, oldTimeStamp } from "./globals.js";

export class Player extends Collider{
    static minSize = 40;
	constructor() {
        super(20, baseHeight / 2, Player.minSize, Player.minSize);
        this.speed = .3;
        this.count = 1;
        this.movementBounds = { left: 0, right: baseWidth, top: 0, bottom: baseHeight};
        this.win = false;
        this.lose = false;
    }
    
    applyEffect(effect) {
        let soundEffect = "";
        let change = 0;
        if (effect.type === "add") {
            change = effect.value;
            this.count += effect.value;
        } else if (effect.type === "multiply") {
            change = this.count * (effect.value - 1);
            this.count *= effect.value;
        } else if (effect.type === "finish") {
            this.win = true;
            return;
        } 
        

        if (change< -20) {
            soundEffect = "badCollect2.wav";
        } else if (change < 0) {
            soundEffect = "badCollect1.wav";
        } else {
            soundEffect = "collectSound.wav";
        }/* else if (change < 5) {
            soundEffect = "collect1.wav";
        } else if (change< 10) {
            soundEffect = "collect2.wav";
        } else if (change < 20) {
            soundEffect = "collect3.wav";
        } else {
            soundEffect = "collect4.wav";
        } */
        
        if (soundEffect !== "")
        {
            audioDict[soundEffect].cloneNode(true).play();
        }
        this.onSizeChanged();
        if (this.count < 0) {
            this.lose = true;
        }
    }

    onSizeChanged() {
        let previousCenter = { x: this.x + (this.w/2), y: this.y + (this.h/2) }
        this.w = Player.minSize + this.count;
        this.h = Player.minSize + this.count;
        this.x = previousCenter.x - (this.w/2);
        this.y = previousCenter.y - (this.h/2);

        this.y = Math.min(this.y, this.movementBounds.bottom - this.h);
        this.y = Math.max(this.y, this.movementBounds.top);
        this.x = Math.min(this.x, this.movementBounds.right - this.w);
        this.x = Math.max(this.x, this.movementBounds.left);
    }

    handleCollision(obstacles) {
        obstacles.forEach(obstacle => {
			if (obstacle.enabled && this.collidesWith(obstacle) && this.collidesWithMiddle(obstacle))
            {
                this.applyEffect(obstacle.trigger());
            }
		});
    }

	draw() {	
        let startX = Math.floor(oldTimeStamp/200) % 2;

        /*ctx.fillStyle = "black";
        ctx.textAlign="left";
		ctx.font = '48px serif';
  		ctx.fillText("X: " + this.x + "WTFFF: " + this.speed, 50, 50);*/
        let image = imgDict["right"];
        ctx.drawImage(image, startX * 40, 0, 40, 40, this.x, this.y, this.w, this.h);

        //ctx.fillStyle = "#ADD8E6";
        ctx.font = '600 24px Verdana';
        //ctx.fillRect(this.x, this.y, this.w, this.h);
        ctx.fillStyle = "orange";
        ctx.textAlign="center";
        ctx.textBaseline = "middle";
        ctx.fillText(this.count, this.x + this.w/2, this.y + this.h/2);

	}

    move(direction, elapsedMS)
    {
        let speed = this.speed * elapsedMS;
        if (direction.up != direction.down && direction.left != direction.right) {
            speed *= .5;
        }
        if (direction.up && !direction.down) {
            this.y -= Math.min(this.y, speed);
        }
        if (!direction.up && direction.down) {
            this.y += Math.min(this.movementBounds.bottom - this.y - this.h, speed);
        }
        if (direction.left && !direction.right) {
            this.x -= Math.min(this.x, speed);
        }
        if (!direction.left && direction.right) {
            this.x += Math.min(this.movementBounds.right - this.x - this.w, speed);
        }
    }
}