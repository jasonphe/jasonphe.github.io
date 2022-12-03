import { Collider } from "./collider.js";
//import { Pengu } from "./pengu.js";
import { imgDict, canvas, ctx, baseWidth, baseHeight } from "./canvas.js";

export class Player extends Collider{
    static minSize = 40;
	constructor() {
        super(150, 150, Player.minSize, Player.minSize);
        this.animIndex = 0;
        this.counter = 0;
        this.speed = 2;
        this.count = 1;
    }
    
    applyEffect(effect) {
        if (effect.type === "add")
        {
            this.count += effect.value;
        }
        else if (effect.type === "multiply")
        {
            this.count *= effect.value;
        }

        this.w = Player.minSize + this.count;
        this.h = Player.minSize + this.count;
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
        let animate = true;
        let startX = 0;
		if (animate)
		{
			let total = 20;
			if (this.counter % total < (total/2))
			{
				startX = 1;
			}
			else 
			{
				startX = 0;
			}
			this.counter++;
		}
		else
		{
			startX = 0;
			this.counter = 0;
		}
        ctx.fillStyle = "black";
        ctx.textAlign="left";
		ctx.font = '48px serif';
  		ctx.fillText("X: " + this.x + "Y: " + this.y, 50, 50);
        
        ctx.drawImage(imgDict["right"], startX * 40, 0, 40, 40, this.x, this.y, this.w, this.h);

        //ctx.fillStyle = "#ADD8E6";
        ctx.font = '600 24px Verdana';
        //ctx.fillRect(this.x, this.y, this.w, this.h);
        ctx.fillStyle = "orange";
        ctx.textAlign="center";
        ctx.textBaseline = "middle";
        ctx.fillText(this.count, this.x + this.w/2, this.y + this.h/2);

	}

    move(direction)
    {
        let speed = this.speed;
        if (direction.up != direction.down && direction.left != direction.right) {
            speed *= .5;
        }
        if (direction.up && !direction.down) {
            this.y -= Math.min(this.y, speed);
        }
        if (!direction.up && direction.down) {
            this.y += Math.min(canvas.height - this.y - this.h, speed);
        }
        if (direction.left && !direction.right) {
            this.x -= Math.min(this.x, speed);
        }
        if (!direction.left && direction.right) {
            this.x += Math.min(canvas.width - this.x - this.w, speed);
        }
    }
}