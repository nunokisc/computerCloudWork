var containers = require('./lib/containers.js');
var nginx_nodes = require('./lib/nginx_nodes.js');
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
const Influx = require('influx')
const influx = new Influx.InfluxDB({
  host: rootContainers.influxdb.ip,
  database: 'telegraf'
})
var requestsPerSecond = 0;
var activeConnections = 0;
var requestsLimitToSpawn = 50;
var requestsLimitToSpawnPropagation = 50;
var connectionsLimitToSpawn = 25;
var connectionsLimitToSpawnPropagation = 25;
var timeOutDel = [];
//add array to reserved ips to loadbalancers to usedIps
containers.setReservedIps(reservedIps);
containers.setRootContainers(rootContainers);

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
				containers.getContainerDataRunning(containerInfo.Id.substring(0,12),true);
				counter ++;
				if(containerName.includes('cwc-nginx-') && !containerName.includes(rootContainers.nginx.name))
				{
					nginx_nodes.setOnlineNginxNodeContainers({name:containerName});
					requestsLimitToSpawn = requestsLimitToSpawn + requestsLimitToSpawnPropagation;
				}
			}

			// verifica se o container é o influxdb
			if(containerName == rootContainers.influxdb.name)
			{
				//setInterval(getActiveConnections,1000);
				setInterval(getRequestsPerSecond,1100);
			}
		});
	}
	// caso não exista nenhum container que seja cwc
	if(counter == 0)
	{
		// iniciar maquinas root
		console.log("No containers running");
		containers.startContainer('nginx', rootContainers.nginx.name, [absolutePath+'/html:/var/www/html',absolutePath+'/http/conf.d/default.conf:/etc/nginx/conf.d/default.conf',absolutePath+'/http/conf.d/0-default.conf:/etc/nginx/conf.d/0-default.conf',absolutePath+'/telegraf:/etc/telegraf'],rootContainers.nginx.ip, function (data, initialStart){
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

function getRequestsPerSecond()
{
	// query para receber os valores de rps
	influx.query('SELECT derivative(max(requests)) as requestsPerSecond FROM nginx where time > now() - 2s GROUP BY time(1s)').then(results => {
		requestsPerSecond = results[0].requestsPerSecond;
	  	console.log("rps: "+results[0].requestsPerSecond);
	  	//caso os rps sejam maiores que o max do master node spawn um novo node
	  	if(requestsPerSecond > requestsLimitToSpawn)
	  	{
	  		requestsLimitToSpawn = requestsLimitToSpawn + requestsLimitToSpawnPropagation;
	  		/*if(timeOutDel.length > 0)
	  		{
	  			clearTimeout(timeOutDel[timeOutDel-1]);
	  			timeOutDel.splice(timeOutDel-1, 1);
	  			console.log(timeOutDel);
	  			console.log("cancelou timeout de node a ser apagado");
	  		}
	  		else
	  		{*/
	  			nginx_nodes.createNewNginxNode(absolutePath,function(){
		  			console.log("arrancou um node");
		  		})
	  		//}
	  		console.log("req: limit "+requestsLimitToSpawn);
	  	}
	  	// caso os rps baixem do valor maximo de pois do spawn de um novo node remove esse node
	  	else if(requestsPerSecond < requestsLimitToSpawn - requestsLimitToSpawnPropagation)
	  	{
	  		//apenas apagar ate ao limite minimo
	  		if(requestsLimitToSpawn > requestsLimitToSpawnPropagation)
	  		{
	  			console.log("adicionou node a timeout");
	  			//console.log(timeOutDel);
	  			// diminuir os limite para o level abaixo
	  			requestsLimitToSpawn = requestsLimitToSpawn - requestsLimitToSpawnPropagation;
	  			timeOutDel.push(setTimeout(()=>{
	  				nginx_nodes.deleteNewNginxNode(absolutePath,function(){
	  					//timeOutDel.splice(timeOutDel-1, 1);
			  			console.log("Apagou um node");
			  		})
	  			},10000));
	  		}	
	  	}
	})
}
			

var htmlPath = path.join(absolutePath, 'static');
app.use(express.static(htmlPath));

http.listen(3000, function(){
	console.log('listening on *:3000');
});

io.on('connection', function(socket){
	console.log('a user connected');
	socket.on('getOnlineContainers',function(){
		containers.getOnlineContainers(function(onlineContainers){
			socket.emit('getOnlineContainers',onlineContainers);
		})
	})
	socket.on('getUsedIps',function(){
		containers.getUsedIps(function(usedIps){
			socket.emit('getUsedIps',usedIps);
		})
	})
	socket.on('getOnlineNginxNodeContainers',function(){
		nginx_nodes.getOnlineNginxNodeContainers(function(onlineNginxNodeContainers){
			socket.emit('getOnlineNginxNodeContainers',onlineNginxNodeContainers);
		})
	})
	socket.on('getRequestsPerSecond',function(){
		socket.emit('getRequestsPerSecond',requestsPerSecond);
	})
	socket.on('getActiveConnections',function(){
		socket.emit('getActiveConnections',activeConnections);
	})
	socket.on('getRequestsLimitToSpawn',function(){
		socket.emit('getRequestsLimitToSpawn',requestsLimitToSpawn);
	})
	socket.on('setRequestsLimitToSpawn',function(msg){
		requestsLimitToSpawn = msg;
		socket.emit('setRequestsLimitToSpawn','Valor alterado para: '+msg);
	})
	socket.on('getRequestsLimitToSpawnPropagation',function(){
		socket.emit('getRequestsLimitToSpawnPropagation',requestsLimitToSpawnPropagation);
	})
	socket.on('setRequestsLimitToSpawnPropagation',function(msg){
		requestsLimitToSpawnPropagation = msg;
		socket.emit('setRequestsLimitToSpawnPropagation','Valor alterado para: '+msg);
	})
	socket.on('getConnectionsLimitToSpawn',function(){
		socket.emit('getConnectionsLimitToSpawn',connectionsLimitToSpawn);
	})
	socket.on('setConnectionsLimitToSpawn',function(msg){
		connectionsLimitToSpawn = msg;
		socket.emit('setConnectionsLimitToSpawn','Valor alterado para: '+msg);
	})
	socket.on('getConnectionsLimitToSpawnPropagation',function(){
		socket.emit('getConnectionsLimitToSpawnPropagation',connectionsLimitToSpawnPropagation);
	})
	socket.on('setConnectionsLimitToSpawnPropagation',function(msg){
		connectionsLimitToSpawnPropagation = msg;
		socket.emit('setConnectionsLimitToSpawnPropagation','Valor alterado para: '+msg);
	})
	socket.on('getRootContainers',function(){
		socket.emit('getRootContainers',rootContainers);
	})
	socket.on('disconnect', function(){
		console.log('user disconnected');
	});
});

