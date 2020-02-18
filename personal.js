var blueColors = convertHexToRGBA([
	'#1739B7',
	'#1545b4',
	'#1350b2',
	'#115caf',
	'#0f67ad',
    '#0d73aa',
    '#0b7ea7',
    '#0a8aa5',
    '#0896a2',
    '#06a1a0',
    '#04ad9d',
    '#02b89b',]);

var myChart;
var defaultConfig = {
    type: 'horizontalBar',
    data: {
        labels: ["C++", "C#", "Javascript", "SQL", "Python", "Java"],
        datasets: [{
                label: 'Proficiency',
                data: [80, 80, 50, 50, 40, 40], 
                borderWidth: 2,
                backgroundColor: blueColors
        }]
    },
    options: {
        title: {
            display: true,
            text: 'Programming Languages'
        },
        scales: {
            xAxes: [{
                ticks: {
                    beginAtZero: true,
                    max: 100,
                }
            }],
            yAxes: [{
                ticks: {
                    fontSize: 40
                }
            }]
        },
        maintainAspectRatio: false
    }
};

window.onload = function() {
    ctx = document.getElementById('canvas').getContext('2d');
    myChart= new Chart(ctx, defaultConfig);
};

$(document).ready(function() {
	$("#SetLanguages").click(function() {
        document.getElementById("SetLanguages").disabled = true;
        document.getElementById("SetTechnologies").disabled = false;
        myChart.options.title.text = 'Programming Languages';
		myChart.data.labels = ["C++", "C#", "Javascript", "SQL", "Python", "Java"];
        myChart.data.datasets[0].data = [80, 80, 50, 50, 40, 40];
        myChart.update();
    });

    $("#SetTechnologies").click(function() {
        document.getElementById("SetLanguages").disabled = false;
        document.getElementById("SetTechnologies").disabled = true;
        myChart.options.title.text = 'Technologies';
		myChart.data.labels = ["Visual Studio 2017", ".NET Framework", "Windows", "Subversion/Git", "Phabricator", "MFC", "Winforms", "Unity Game Engine", "Linux", "XML/SOAP"];
        myChart.data.datasets[0].data = [80, 80, 70, 60, 60, 60, 60, 50, 40, 30];
        myChart.update();
    });
    
});

function convertHexToRGBA(hexes){
	for (let i = 0; i < hexes.length; i++)
	{
		let hex = hexes[i];
		hex = hex.replace('#','');
		r = parseInt(hex.substring(0,2), 16);
		g = parseInt(hex.substring(2,4), 16);
		b = parseInt(hex.substring(4,6), 16);

		hexes[i] = 'rgba('+r+','+g+','+b+','+1+')';
	}
	
	return hexes;
}
