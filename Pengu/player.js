import { Collider } from "./collider.js";
import { imgDict, audioDict, canvas, ctx, baseWidth, baseHeight, oldTimeStamp } from "./globals.js";
import { Obstacle, Gate, Spike, PowerUp } from "./obstacle.js";

export class Player extends Collider{
    static minSize = 40;
	constructor() {
        super(20, baseHeight / 2, Player.minSize, Player.minSize);
        this.speed = .3;
        this.count = 1;
        this.movementBounds = { left: 0, right: baseWidth, top: 0, bottom: baseHeight};
        this.win = false;
        this.lose = false;
        this.invincibleTime = 0;
        this.collectionText = [];
        this.modifier = 1;
    }
    
    applyEffect(effect) {
        let soundEffect = "";
        let change = 0;
        let value = effect.value * this.modifier;
        if (effect.type === "add") {
            change = value;
            this.count += value;
        } else if ((effect.type === "spike" || effect.type === "orca") && 
                this.invincibleTime <= 0) {
            change = value;
            this.count += value;
            this.invincibleTime = 500;
        } else if (effect.type === "multiply") {
            change = this.count * (value - 1);
            this.count *= value;
        } else if (effect.type === "finish") {
            this.win = true;
            return;
        }
        
        this.count = Math.max(-1, this.count);
        if (change === 0 && effect.type !== "powerUp") {
            return;
        }

        let changeString = "?";
        let colors = "";
        let direction = "up";
        let fontSize = 30;
        let collectY = this.y > baseHeight/2 ? this.y - 5 : this.y + this.h + 5;
        if (effect.type === "powerUp") {
            soundEffect = "powerUp.wav";
            changeString = this.powerUpCollect(effect);
            colors = ['purple', 'blue'];
        } else {
            changeString = change > 0 ? "+" + change : change.toString();
            colors = change > 0 ? ['green', 'blue'] : ['red', 'yellow'];
            direction = change > 0 ? "up" : "down";
            fontSize = 12 + Math.abs(change);
        }

        this.collectionText.push(new CollectionText(this.x + this.w/2, collectY, changeString, colors, direction, fontSize));
        
        if (change < -20) {
            soundEffect = "badCollect2.wav";
        } else if (change < 0) {
            soundEffect = "badCollect1.wav";
        } else if (change > 0) {
            soundEffect = "collectSound.wav";
        }

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
        this.w = Math.max(Player.minSize, Player.minSize + this.count);
        this.h = Math.max(Player.minSize, Player.minSize + this.count);
        this.x = previousCenter.x - (this.w/2);
        this.y = previousCenter.y - (this.h/2);

        this.y = Math.min(this.y, this.movementBounds.bottom - this.h);
        this.y = Math.max(this.y, this.movementBounds.top);
        this.x = Math.min(this.x, this.movementBounds.right - this.w);
        this.x = Math.max(this.x, this.movementBounds.left);
    }

    powerUpCollect(effect) {
        switch (effect.powerType) {
            case "speed": {
                this.speed *= 1.5;
                return "+SPEED";
            }
            case "modifier": {
                this.modifier *= 2;
                return "x2 POINTS";
            }
        }

        return "?";
    }

    handleCollision(obstacles) {
        obstacles.forEach(obstacle => {
			if (obstacle.enabled && this.collidesWith(obstacle))
            {
                let trigger = false;
                if (obstacle instanceof Gate) {
                    if (this.collidesWithMiddle(obstacle)) {
                        trigger = true;
                    }
                } else if (obstacle instanceof Spike || obstacle instanceof PowerUp) {
                    if (this.collidesWithCircle(obstacle)) {
                        trigger = true;
                    }
                } else {
                    trigger = true;
                }
                if (trigger) {
                    this.applyEffect(obstacle.trigger());
                }
            }
		});
    }

	draw() {	
        let frame = Math.floor(oldTimeStamp/200) % 4;
        let image = imgDict[`frame${frame}`];
        ctx.drawImage(image, 0, 0, image.width, image.height, this.x, this.y, this.w, this.h);

        ctx.beginPath();
        ctx.font = '600 24px Verdana';
    
        ctx.fillStyle = "orange";
        ctx.textAlign="center";
        ctx.textBaseline = "middle";
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'black';
        ctx.fillText(this.count, this.x + this.w/2, this.y + this.h/2);
        ctx.strokeText(this.count, this.x + this.w/2, this.y + this.h/2);
        this.collectionText.forEach(element => { 
            element.draw();
        });
	}

    move(direction, elapsedMS) {
        if (this.invincibleTime > 0) {
            this.invincibleTime -= elapsedMS;
        }
        let speed = this.speed * elapsedMS;
        if (direction.up != direction.down && direction.left != direction.right) {
            speed *= .6;
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

        for (let i = 0; i < this.collectionText.length; i++) {
            let colText = this.collectionText[i];
            colText.move(elapsedMS);
            if (colText.finished)
            {
                this.collectionText[i] = this.collectionText[this.collectionText.length - 1];
                this.collectionText.pop();
                i--;
            }
        }
    }
}

export class CollectionText { 
    constructor(x, y, text, colors, direction, fontSize) {
        this.x = x;
        this.y = y;
        this.origY = y;
        this.text = text;
        this.finished = false;
        this.speed = 1;
        this.colors = colors;
        this.direction = direction;
        this.fontSize = Math.min(100, fontSize);
    }

    move(elapsedMS) {
        this.x -= Obstacle.speedX * elapsedMS;
        this.y += this.direction === "up" ?  elapsedMS * -.03 : elapsedMS * .03;
        if (Math.abs(this.origY - this.y) > 40) {
            this.finished = true;
        }
    }

    draw() {
        if (this.finished) {
            return;
        }

        let frame = Math.floor(oldTimeStamp/200) % 2;
        ctx.beginPath();
        let fontString = `600 ${this.fontSize}px Verdana`;
        ctx.font = fontString;
        ctx.textAlign="center";
        ctx.textBaseline = "middle"; 
        ctx.fillStyle = this.colors[frame];
        //ctx.strokeStyle = 'black';
        ctx.fillText(this.text, this.x, this.y);
    }
}