function calc() {
    var names, ranks, val1, val2, players;
    val1 = document.getElementById("names").value;
    val2 = document.getElementById("ranks").value; 
    names = val1.split("\n");
    ranks = val2.split("\n");
    var numoutput = "";
    numoutput += "Players input: " + String(names.length) + "<br> Ranks input: " + String(ranks.length);
    document.getElementById("nump").innerHTML = numoutput;
    players = [];
    for (i=0; i<ranks.length; i++)
    {
        var val;
        switch(ranks[i][0].toLowerCase())
        {
            case 'b':
                val = 5;
                break;
            case 's':
                val = 10;
                break;
            case 'g':
                val = 15;
                break;
            case 'p':
                val = 20;
                break;
            case 'd':
                val = 25;
                break;
            case 'm':
                val = 27;
                break;
            case 'c':
                val = 30;
                break;
            default:
                val = 5;
                break;
        }
        if(ranks[i].length>1)
            val-= Number(ranks[i][1])-1;
        players.push({name:names[i],rank:val,div:ranks[i]});
    }
    players.sort(function(a, b) {return b.rank - a.rank});

    var numTeams = players.length/5;
    var teams = [];
    for (i = 0; i < numTeams; i++)
    {
        var teamx = [];
        for (j = 0; j < 5; j++)
            if (j%2 == 0)
                teamx.push(players[j*numTeams+i])
            else
                teamx.push(players[j*numTeams+numTeams-i-1])
        teams.push(teamx)
    }

    var output = "";
    for (i = 0; i < numTeams; i++)
    {
        output += "Team " + String(i + 1) +":<br>";
        var sum = 0;
        for (j = 0; j < teams[i].length; j++)
        {
            output += teams[i][j].name + " - " + teams[i][j].div + "<br>";
            sum += teams[i][j].rank;
        }
        output += "Team Value:" + String(sum) + "<br><br>";

    }
        
    document.getElementById("output").innerHTML = output;
}