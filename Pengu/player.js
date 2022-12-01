import { Collider } from "./collider.js";
import { Pengu } from "./pengu.js";
import { canvas, ctx, baseWidth, baseHeight } from "./canvas.js";

export class Player extends Collider{
	constructor() {
        super(150, 150, 40, 40);
        this.animIndex = 0;
        this.counter = 0;
        this.speedY = 5;
        this.pengus = [];
    }
    
    addPengus(count) {
        if (count < 0)
        {
            this.pengus.splice(0, Math.abs(count));
        }
        for (let i = 0; i < count; i++) {
            
            this.pengus.push(new Pengu(Math.random() * this.x, Math.random() * 200, this));
        }
    }

    movePengus(obstacles) {
        obstacles.forEach(obstacle => {
			if (obstacle.enabled && this.collidesWith(obstacle))
            {
                this.addPengus(obstacle.trigger());
            }
		});
        this.pengus.forEach(pengu => {
            pengu.follow();
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
        this.pengus.forEach(element => {
            element.draw(startX);
        });
        ctx.fillStyle = "#ADD8E6";
        ctx.font = '24px serif';
        ctx.fillRect(this.x, this.y, this.w, this.h);
        ctx.fillStyle = "black";
        ctx.textAlign="center";
        ctx.textBaseline = "middle";
        ctx.fillText(this.pengus.length, this.x + this.w/2, this.y + this.h/2);
	}

    moveUp() {
        this.y -= Math.min(this.y, this.speedY);
    }

    moveDown() {
        this.y += Math.min(canvas.height - this.y - this.h, this.speedY);
    }
}