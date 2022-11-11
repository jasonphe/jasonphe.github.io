class Collider {
    constructor(x, y, width, height) {
        this.x = x;
        this.y = y;
        this.w = width;
        this.h = height;
		this.ID = Collider.nextID;
		Collider.nextID++;
    }
    static nextID = 0;

    collidesWith(other) {
        if (
            this.x < other.x + other.w &&
            this.x + this.w > other.x &&
            this.y < other.y + other.h &&
            this.h + this.y > other.y
          ) {
            return true;
        }
        return false;
    }

    collidesWithCircle(other) {
        const dx = (this.w/2 + this.x) - (other.w/2 + other.x);
        const dy = (this.h/2 + this.y) - (other.h/2 + other.y);
        const distance = Math.sqrt(dx * dx + dy * dy);
        return distance < ((this.w/2) + (other.w/2));
    }

    collidesMore(newX, newY, other) {
        let dx = (this.w/2 + this.x) - (other.w/2 + other.x);
        let dy = (this.h/2 + this.y) - (other.h/2 + other.y);
        const distanceOrig = Math.sqrt(dx * dx + dy * dy);

        if (distanceOrig > ((this.w/2) + (other.w/2)))
        {
            return false;
        }

        dx = (this.w/2 + newX) - (other.w/2 + other.x);
        dy = (this.h/2 + newY) - (other.h/2 + other.y);
        const distanceNew = Math.sqrt(dx * dx + dy * dy);
        return distanceNew < distanceOrig;
    }
}