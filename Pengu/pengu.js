import { Collider } from "./collider.js";
import { imgDict, canvas, ctx, baseWidth, baseHeight } from "./canvas.js";

export class Pengu extends Collider{
	constructor(relX, relY, player) {
		super( relX, player.x + relY, 25, 25);
        this.relativeX = relX;
        this.relativeY = relY;
        this.player = player;
    }
	
	static speedX = 3;
	static speedY = 4;

	draw(startX) {	
		/*let imgType = this.position;
		let animate = player.velX > 1 || player.velX < -1 || player.jumping || player.charging;
		if (player.jumping || player.charging)
		{
			imgType = "jump" + imgType;
		}
		
		let img = imgDict[imgType];*/
		ctx.drawImage(imgDict["right"], startX * 40, 0, 40, 40, this.x, this.y, 40, 40);
		ctx.fillStyle = "red";
		ctx.font = '48px serif';
	}

	follow() {
		let newX = this.x;
		let newY = this.y;

		let xToPlayer = Math.abs(this.x - this.player.x);
		if (xToPlayer > 0) {
			let dx = Math.min(xToPlayer, Pengu.speedX);
			if (this.x < this.player.x)	{
				newX += dx;
			}
			else if (this.x > this.player.x) {
				newX -= dx;
			}
		}

		let yToPlayer = Math.abs(this.y - this.player.y);
		if (yToPlayer > 0)	{
			let dy = Math.min(yToPlayer, Pengu.speedY);
			if (this.y < this.player.y)	{
				newY += dy;
			}
			else if (this.y > this.player.y) {
				newY -= dy;
			}
		}
		
			
		if (!this.collidesPengus(newX, newY)) {			
			this.x = newX;
			this.y = newY;
		}
	}

	collidesPengus(newX, newY) {
		return this.player.pengus.some(pengu => {
			if (pengu === this) {
				return false;
			}
			if (super.collidesMore(newX, newY, pengu))
			{
				return true;
			}
			return false;
		});
	}
    /*moveUp() {
        this.y -= this.speedY;
    }

    moveDown() {
        this.y += this.speedY;
    }*/
}