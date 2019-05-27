var containers = require('./lib/containers.js');
var express = require('express');
var app = express();
var http = require('http').createServer(app);
var io = require('socket.io')(http);
var path = require('path');
var absolutePath = __dirname;
var containerInitials = "cwc";
var rootContainers = {
	"nginx": {name:'cwc-nginx-master', ip:"172.18.0.3"},
	"php": {name:'cwc-php-fpm-master', ip:"172.18.0.5"},
	"mysql": {name:'cwc-mysql-master', ip:"172.18.0.4"},
	"nginxlb": {name:'cwc-nginxlb-master', ip:"172.18.0.2"},
	"influxdb": {name:'cwc-influxdb-master', ip:"172.18.0.6"},
	"grafana": {name:'cwc-grafana-master', ip:"172.18.0.8"}
};
var reservedIps = ['172.18.0.12','172.18.0.22','172.18.0.32'];
var requestsPerSecond = 0;
var activeConnections = 0;
var requestsLimitToSpawn = 25;
var requestsLimitToSpawnPropagation = 25;
var connectionsLimitToSpawn = 25;
var connectionsLimitToSpawnPropagation = 25;
//add array to reserved ips to loadbalancers to usedIps
containers.addReservedIps(reservedIps,function(data){
	console.log(data);
})
containers.docker.listContainers(function (err, dockerContainers) {
	//verificar se existem dockerContainers a correr
	let counter = 0;
	if(dockerContainers.length > 0)
	{
		//retornar o nome e ip da maquina iniciada
		dockerContainers.forEach(function (containerInfo) {
			//console.log(containerInfo.Names[0]);
			let containerName = containerInfo.Names[0].substring(1,containerInfo.Names[0].length);
			// verficiar se o container é cwc
			if(containerInfo.Names[0].substring(1,4) == containerInitials)
			{
				containers.getContainerDataRunning(containerInfo.Id,true);
				counter ++;
				if(containerName.includes('cwc-nginx-') && !containerName.includes(rootContainers.nginx.name))
				{
					onlineNginxNodeContainers.push({name:containerName});
					requestsLimitToSpawn = requestsLimitToSpawn + requestsLimitToSpawnPropagation;
				}
			}

			// verifica se o container é o influxdb
			if(containerName == rootContainers.influxdb.name)
			{
				//setInterval(getActiveConnections,1000);
				//setInterval(getRequestsPerSecond,1000);
			}
		});
	}
	// caso não exista nenhum container que seja cwc
	if(counter == 0)
	{
		// iniciar maquinas root
		console.log("No containers running");
		containers.startContainer('nginx', rootContainers.nginx.name, [absolutePath+'/html:/var/www/html',absolutePath+'/http/conf.d/default.conf:/etc/nginx/conf.d/default.conf',absolutePath+'/telegraf:/etc/telegraf'],rootContainers.nginx.ip, function (data, initialStart){
			containers.getContainerDataRunning(data.Config.Hostname,initialStart);
		});
		containers.startContainer('php-fpm', rootContainers.php.name, [absolutePath+'/html:/var/www/html'],rootContainers.php.ip, function (data, initialStart){
			containers.getContainerDataRunning(data.Config.Hostname,initialStart);
		});
		containers.startContainer('mysql-server', rootContainers.mysql.name, [absolutePath+'/db:/docker-entrypoint-initdb.d/'],rootContainers.mysql.ip, function (data, initialStart){
			containers.getContainerDataRunning(data.Config.Hostname,initialStart);
		});
		containers.startContainer('nginx', rootContainers.nginxlb.name, [absolutePath+'/loadbalancer/conf.d:/etc/nginx/conf.d',absolutePath+'/telegraf:/etc/telegraf'],rootContainers.nginxlb.ip, function (data, initialStart){
			containers.getContainerDataRunning(data.Config.Hostname,initialStart);
		});
		containers.startContainer('influxdb', rootContainers.influxdb.name, [],rootContainers.influxdb.ip, function (data, initialStart){
			containers.getContainerDataRunning(data.Config.Hostname,initialStart);
		});
		containers.startContainer('grafana', rootContainers.grafana.name, [],rootContainers.grafana.ip, function (data, initialStart){
			containers.getContainerDataRunning(data.Config.Hostname,initialStart);
		});
	}
});

var htmlPath = path.join(absolutePath, 'static');
app.use(express.static(htmlPath));

http.listen(3000, function(){
	console.log('listening on *:3000');
});

io.on('connection', function(socket){
	console.log('a user connected');
	socket.on('getOnlineContainers',function(){
		socket.emit('getOnlineContainers',containers.getOnlineContainers);
	})
	socket.on('getUsedIps',function(){
		socket.emit('getUsedIps',containers.getUsedIps);
	})
});

