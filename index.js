var absolutePath = __dirname;
var containerInitials = "cwc";
var rootContainers = {
	"nginx": {name:'cwc-nginx-master', ip:"172.18.0.3"},
	"php": {name:'cwc-php-fpm-master', ip:"172.18.0.5"},
	"mysql": {name:'cwc-mysql-master', ip:"172.18.0.4"},
	"nginxlb": {name:'cwc-nginxlb-master', ip:"172.18.0.2"},
	"influxdb": {name:'cwc-influxdb-master', ip:"172.18.0.6"},
	"telegraf": {name:'cwc-telegraf-master', ip:"172.18.0.7"},
	"grafana": {name:'cwc-grafana-master', ip:"172.18.0.8"}
};

var Docker = require('dockerode');
var docker = new Docker({socketPath: '/var/run/docker.sock'});
const Influx = require('influx')
const influx = new Influx.InfluxDB({
  host: rootContainers.influxdb.ip,
  database: 'telegraf'
})
var express = require('express');
var app = express();
var http = require('http').createServer(app);
var io = require('socket.io')(http);
var path = require('path');
var NginxConfFile = require('nginx-conf').NginxConfFile;
const fs = require('fs')
var usedIps = [];
var onlineContainers = [];
var onlineNginxNodeContainers = [];
var requestsPerSecond = 0;
var activeConnections = 0;
var requestsLimitToSpawn = 25;
var requestsLimitToSpawnPropagation = 25;
var connectionsLimitToSpawn = 25;
var connectionsLimitToSpawnPropagation = 25;
docker.listContainers(function (err, containers) {
	//verificar se existem containers a correr
	let counter = 0;
	if(containers.length > 0)
	{
		//retornar o nome e ip da maquina iniciada
		containers.forEach(function (containerInfo) {
			//console.log(containerInfo.Names[0]);
			let containerName = containerInfo.Names[0].substring(1,containerInfo.Names[0].length);
			// verficiar se o container é cwc
			if(containerInfo.Names[0].substring(1,4) == containerInitials)
			{
				getContainerDataRunning(containerInfo.Id,true);
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
				setInterval(getRequestsPerSecond,1000);
			}
		});
	}
	// caso não exista nenhum container que seja cwc
	if(counter == 0)
	{
		// iniciar maquinas root
		console.log("No containers running");
		startContainer('nginx', rootContainers.nginx.name, [absolutePath+'/html:/var/www/html',absolutePath+'/http/conf.d/default.conf:/etc/nginx/conf.d/default.conf'],rootContainers.nginx.ip);
		startContainer('php-fpm', rootContainers.php.name, [absolutePath+'/html:/var/www/html'],rootContainers.php.ip)
		startContainer('mysql-server', rootContainers.mysql.name, [absolutePath+'/db:/docker-entrypoint-initdb.d/'],rootContainers.mysql.ip);
		startContainer('nginx', rootContainers.nginxlb.name, [absolutePath+'/loadbalancer/conf.d:/etc/nginx/conf.d'],rootContainers.nginxlb.ip);
		startContainer('influxdb', rootContainers.influxdb.name, [],rootContainers.influxdb.ip);
		startContainer('telegraf', rootContainers.telegraf.name, [absolutePath+'/telegraf:/etc/telegraf'],rootContainers.telegraf.ip);
		startContainer('grafana', rootContainers.grafana.name, [],rootContainers.grafana.ip);
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
	  		createNewNginxNode();
	  		console.log("req: limit "+requestsLimitToSpawn);
	  	}
	  	// caso os rps baixem do valor maximo de pois do spawn de um novo node remove esse node
	  	else if(requestsPerSecond < requestsLimitToSpawn - requestsLimitToSpawnPropagation)
	  	{
	  		//apenas apagar ate ao limite minimo
	  		if(requestsLimitToSpawn > requestsLimitToSpawnPropagation)
	  		{
	  			console.log("eliminar coiso");
	  			// diminuir os limite para o level abaixo
	  			requestsLimitToSpawn = requestsLimitToSpawn - requestsLimitToSpawnPropagation;
	  			setTimeout(()=>{
	  				deleteNewNginxNodeTimeOut();
	  			},10000);
	  		}	
	  	}
	})
}

function deleteNewNginxNodeTimeOut()
{
	//apagar node passados x ms
	setTimeout(()=>{
		deleteNewNginxNode();
	},10000);
}

function getActiveConnections()
{
	influx.query('SELECT LAST(active) as activeConnections FROM nginx').then(results => {
		activeConnections = results[0].activeConnections;
	  	console.log("conn "+results[0].activeConnections);
	  	if(activeConnections > connectionsLimitToSpawn)
	  	{
	  		connectionsLimitToSpawn = connectionsLimitToSpawn + connectionsLimitToSpawnPropagation;
	  		createNewNginxNode();
	  		console.log("conn: limit "+connectionsLimitToSpawn);
	  	}
	  	else if(activeConnections < connectionsLimitToSpawn - connectionsLimitToSpawnPropagation)
	  	{
	  		if(connectionsLimitToSpawn > connectionsLimitToSpawnPropagation)
	  		{
	  			console.log("eliminar coiso");
	  			connectionsLimitToSpawn = connectionsLimitToSpawn - connectionsLimitToSpawnPropagation;
	  		}	
	  	}
	})
}

function getContainerDataRunning(id,initialStart)
{
	//inspeciona o container dado pelo id
	if(initialStart)
	{
		let container = docker.getContainer(id);
		container.inspect(function (err, data) {
			usedIps.push(data.NetworkSettings.Networks.br0.IPAddress);
			onlineContainers.push({name:data.Name.substring(1,data.Name.length) ,id:data.Id ,ip:data.NetworkSettings.Networks.br0.IPAddress});
			console.log(data.Name + ' ' + data.NetworkSettings.Networks.br0.IPAddress + ' Online');
		});
	}
	else
	{
		let container = docker.getContainer(id);
		container.inspect(function (err, data) {
			onlineContainers.push({name:data.Name.substring(1,data.Name.length) ,id:data.Id ,ip:data.NetworkSettings.Networks.br0.IPAddress});
			console.log(data.Name + ' ' + data.NetworkSettings.Networks.br0.IPAddress + ' Online');
		});
	}
}

async function deleteNewNginxNode()
{
	//verifica se existem nodes extra activos
	if(onlineNginxNodeContainers.length > 0)
	{
		let nginxlbId = "";
		// ve qual o id do loadbalancer
		for (let i = 0; i < onlineContainers.length; i++) {
			if(onlineContainers[i].name == rootContainers.nginxlb.name)
			{
				nginxlbId = onlineContainers[i].id;
			}
		}
		// vai buscar o nome do container que esta no topo do array
		let containerName = onlineNginxNodeContainers[0].name;
		console.log(containerName);
		// faz um substring para obter o numero do container apartir do nome
		let containersNumber = containerName.substring(containerName.length-1,containerName.length);
		console.log(containersNumber);
		//apaga o registo do topo do array
		onlineNginxNodeContainers.shift();
		// pesquisa no array onlineContainers o container name e retorna o objecto
		let onlineNginxContainer = search(containerName, onlineContainers);
		// get container by id
		let containerNginx = docker.getContainer(onlineNginxContainer.id);
		// remove 
		onlineContainers = arrayRemove(onlineContainers, onlineNginxContainer);
		usedIps = arrayRemove(usedIps, onlineNginxContainer.ip);
		
		console.log(onlineNginxContainer.id);

		let onlineFpmContainer =search("cwc-php-fpm-"+containersNumber, onlineContainers);
		let containerFpm = docker.getContainer(onlineFpmContainer.id);
		onlineContainers = arrayRemove(onlineContainers, onlineFpmContainer);
		usedIps = arrayRemove(usedIps, onlineFpmContainer.ip);

		let container = docker.getContainer(nginxlbId);

		containerNginx.stop(function(){
			fs.unlink(absolutePath+"/http/conf.d/"+containerName+".conf", (err) => {
				if (err) {
					console.error(err)
					return
				}
			})
			containerFpm.stop(function(){
				containerFpm.remove();
			});
			containerNginx.remove();
			
			NginxConfFile.create(__dirname+'/loadbalancer/conf.d/0-default.conf', function(err, conf) {
				if (err) {
					console.log(err);
					return;
				}
				for (let i = 0; i < conf.nginx.upstream.server.length; i++) {
					if(onlineNginxContainer.ip == conf.nginx.upstream.server[i]._value)
					{
						console.log("remove: "+conf.nginx.upstream.server[i]._value);
						conf.nginx.upstream._remove('server',i);
					}
				}
			});

			var options = {
				Cmd: ['bash', '-c', 'service nginx reload'],
				AttachStdout: true,
				AttachStderr: true
			};

			container.exec(options, function(err, exec) {
				if (err) return;
				exec.start(function(err, stream) {
					if (err) return;

					container.modem.demuxStream(stream, process.stdout, process.stderr);

					exec.inspect(function(err, data) {
						if (err) return;
						console.log(data);
						console.log(usedIps);
						console.log(onlineContainers);
						console.log(onlineNginxNodeContainers);
					});
				});
			});
		});
	}
}

function search(nameKey, myArray){
    for (var i=0; i < myArray.length; i++) {
        if (myArray[i].name === nameKey) {
            return myArray[i];
        }
    }
}

function arrayRemove(arr, value) {

   return arr.filter(function(ele){
       return ele != value;
   });

}

async function createNewNginxNode()
{
	let randomPhpIp = "";
	let randomNginxIp = "";
	let nginxlbId = "";
	let containerNumber = onlineNginxNodeContainers.length;
	onlineNginxNodeContainers.push({name: 'cwc-nginx-'+containerNumber});
	for (let i = 0; i < onlineContainers.length; i++) {
		if(onlineContainers[i].name == rootContainers.nginxlb.name)
		{
			nginxlbId = onlineContainers[i].id;
		}
	}
	while (true) 
	{
	  	randomPhpIp = "172.18.0."+(Math.floor(Math.random() * 255) + 2);
	    if(!usedIps.includes(randomPhpIp))
	    {
	    	console.log(randomPhpIp);
	    	break;
	    }
	}
	startContainer('php-fpm', 'cwc-php-fpm-'+containerNumber, [absolutePath+'/html:/var/www/html'],randomPhpIp);
	console.log("startContainer: "+'php-fpm'+' '+'cwc-php-fpm-'+containerNumber+' '+[absolutePath+'/html:/var/www/html']+' '+randomPhpIp);
	NginxConfFile.create(__dirname+'/http/conf.d/default.conf', function(err, conf) {
		if (err) {
			console.log(err);
			return;
		}

		//reading values
		conf.nginx.server.add_header._value = "X_NODE cwc-nginx-"+containerNumber;
		conf.nginx.server.location[1].fastcgi_pass._value = randomPhpIp+":9000";
		conf.live(__dirname+'/http/conf.d/cwc-nginx-'+containerNumber+'.conf');
		conf.die(__dirname+'/http/conf.d/default.conf');
	});
	while (true) 
	{
	  	randomNginxIp = "172.18.0."+(Math.floor(Math.random() * 255) + 2);
	    if(!usedIps.includes(randomNginxIp))
	    {
	    	console.log(randomNginxIp);
	    	break;
	    }
	}
	startContainer('nginx', 'cwc-nginx-'+containerNumber, [absolutePath+'/html:/var/www/html',absolutePath+'/http/conf.d/cwc-nginx-'+containerNumber+'.conf:/etc/nginx/conf.d/default.conf'],randomNginxIp);
	console.log("startContainer: "+'nginx'+' '+'cwc-nginx-'+containerNumber+' '+[absolutePath+'/html:/var/www/html',absolutePath+'/http/conf.d/cwc-nginx-'+containerNumber+'.conf:/etc/nginx/conf.d/default.conf']+' '+randomNginxIp);
	NginxConfFile.create(__dirname+'/loadbalancer/conf.d/0-default.conf', function(err, conf) {
		if (err) {
			console.log(err);
			return;
		}
		conf.nginx.upstream._add('server', randomNginxIp);
	});
	let container = docker.getContainer(nginxlbId);
	var options = {
		Cmd: ['bash', '-c', 'service nginx reload'],
		AttachStdout: true,
		AttachStderr: true
	};

	container.exec(options, function(err, exec) {
		if (err) return;
		exec.start(function(err, stream) {
			if (err) return;

			container.modem.demuxStream(stream, process.stdout, process.stderr);

			exec.inspect(function(err, data) {
				if (err) return;
				console.log(data);
			});
		});
	});
}

// Iniciar container do tipo x com o nome x com array de binds e com o ip x (verficar se não esta em uso)
function startContainer(containerType, containerName, containerBinds, containerIp)
{
	usedIps.push(containerIp);
	if(containerType == 'php-fpm')
	{
		docker.createContainer({Image: 'kisc/php-fpm-kisc', Cmd: [], name: containerName, HostConfig: {'Binds': containerBinds}, NetworkingConfig: { "EndpointsConfig": { "br0": { "IPAMConfig": { "IPv4Address": containerIp} } } }}, function (err, container) {
			container.start(function (err, data) {
				console.log(data);
			});
			//inspect para retornar o nome e ip da maquina iniciada
			container.inspect(function (err, data) {
				setTimeout(function(){
					getContainerDataRunning(data.Config.Hostname,false);
				},3000);
			});
		});
	}
	else if(containerType == 'mysql-server')
	{
		//MYSQL_ROOT_PASSWORD para password do root & MYSQL_DATABASE para base de dados que é criada com o binding no docker-entrypoint-initdb.d
		docker.createContainer({Image: 'mariadb', Cmd: ['mysqld'], name: containerName, Env:['MYSQL_ROOT_PASSWORD=root','MYSQL_DATABASE=wordpress'], HostConfig: {'Binds': containerBinds}, NetworkingConfig: { "EndpointsConfig": { "br0": { "IPAMConfig": { "IPv4Address": containerIp} } } }}, function (err, container) {

			//deixar ter acesso de fora do container
			var options = {
				Cmd: ['bash', '-c', 'echo "bind-address = 0.0.0.0" >> /etc/mysql/my.cnf'],
				AttachStdout: true,
				AttachStderr: true
			};

			container.exec(options, function(err, exec) {
				if (err) return;
				exec.start(function(err, stream) {
					if (err) return;

					container.modem.demuxStream(stream, process.stdout, process.stderr);

					exec.inspect(function(err, data) {
						if (err) return;
						console.log(data);
					});
				});
			});
			container.start(function (err, data) {
				console.log(data);
			});
			//inspect para retornar o nome e ip da maquina iniciada
			container.inspect(function (err, data) {
				setTimeout(function(){
					getContainerDataRunning(data.Config.Hostname,false);
				},3000);
			});
		});
	}
	else if(containerType == 'nginx')
	{
		if(containerName == 'cwc-nginxlb-master')
		{
			docker.createContainer({Image: 'nginx', Cmd: ['nginx', '-g', 'daemon off;'], name: containerName, 'ExposedPorts': { '80/tcp': {} }, HostConfig: {'Binds': containerBinds, "PortBindings": { "80/tcp": [{ "HostPort": "80" }] }}, NetworkingConfig: { "EndpointsConfig": { "br0": { "IPAMConfig": { "IPv4Address": containerIp} } } }}, function (err, container) {
				container.start(function (err, data) {
					console.log(data);
				});
				//inspect para retornar o nome e ip da maquina iniciada
				container.inspect(function (err, data) {
					setTimeout(function(){
						getContainerDataRunning(data.Config.Hostname,false);
					},3000);
				});
			});
		}
		else
		{
			docker.createContainer({Image: 'nginx', Cmd: ['nginx', '-g', 'daemon off;'], name: containerName, HostConfig: {'Binds': containerBinds}, NetworkingConfig: { "EndpointsConfig": { "br0": { "IPAMConfig": { "IPv4Address": containerIp} } } }}, function (err, container) {
				container.start(function (err, data) {
					console.log(data);
				});
				//inspect para retornar o nome e ip da maquina iniciada
				container.inspect(function (err, data) {
					setTimeout(function(){
						getContainerDataRunning(data.Config.Hostname,false);
					},3000);
				});
			});
		}
	}
	else if(containerType == "influxdb")
	{
		docker.createContainer({Image: 'influxdb', Cmd: [], name: containerName, HostConfig: {'Binds': containerBinds}, NetworkingConfig: { "EndpointsConfig": { "br0": { "IPAMConfig": { "IPv4Address": containerIp} } } }}, function (err, container) {
			container.start(function (err, data) {
				console.log(data);
			});
			//inspect para retornar o nome e ip da maquina iniciada
			container.inspect(function (err, data) {
				setTimeout(function(){
					getContainerDataRunning(data.Config.Hostname,false);
				},3000);
			});
		});
	}
	else if(containerType == "telegraf")
	{
		docker.createContainer({Image: 'telegraf', Cmd: [], name: containerName, HostConfig: {'Binds': containerBinds}, NetworkingConfig: { "EndpointsConfig": { "br0": { "IPAMConfig": { "IPv4Address": containerIp} } } }}, function (err, container) {
			container.start(function (err, data) {
				console.log(data);
			});
			//inspect para retornar o nome e ip da maquina iniciada
			container.inspect(function (err, data) {
				setTimeout(function(){
					getContainerDataRunning(data.Config.Hostname);
				},3000);
				// espera 30secs ate arrancar o telegraf e o influx db para evitar timeout de querys
				setTimeout(()=>{
					//setInterval(getActiveConnections,1000);
					setInterval(getRequestsPerSecond,1000);
				},30000);
			});
		});
	}
	else if(containerType == "grafana")
	{
		docker.createContainer({Image: 'tiagosantana/grafana', Cmd: [], name: containerName, 'ExposedPorts': { '3001/tcp': {} }, HostConfig: {PortBindings: {'3000/tcp': [{ HostPort: '3001' }]}}, NetworkingConfig: { "EndpointsConfig": { "br0": { "IPAMConfig": { "IPv4Address": containerIp} } } } }, function (err, container) {

			container.start(function (err, data) {
				console.log(data);
			});
			//inspect para retornar o nome e ip da maquina iniciada
			container.inspect(function (err, data) {
				setTimeout(function(){
					getContainerDataRunning(data.Config.Hostname);
				},3000);
			});
		});
	}
}


var htmlPath = path.join(absolutePath, 'static');
app.use(express.static(htmlPath));

http.listen(3000, function(){
	console.log('listening on *:3000');
});

io.on('connection', function(socket){
	console.log('a user connected');
	socket.on('getOnlineContainers',function(){
		socket.emit('getOnlineContainers',onlineContainers);
	})
	socket.on('getUsedIps',function(){
		socket.emit('getUsedIps',usedIps);
	})
	socket.on('getOnlineNginxNodeContainers',function(){
		socket.emit('getOnlineNginxNodeContainers',onlineNginxNodeContainers);
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
	socket.on('getRequestsLimitToSpawnPropagation',function(){
		socket.emit('getRequestsLimitToSpawnPropagation',requestsLimitToSpawnPropagation);
	})
	socket.on('getConnectionsLimitToSpawn',function(){
		socket.emit('getConnectionsLimitToSpawn',connectionsLimitToSpawn);
	})
	socket.on('getConnectionsLimitToSpawnPropagation',function(){
		socket.emit('getConnectionsLimitToSpawnPropagation',connectionsLimitToSpawnPropagation);
	})
	socket.on('getRootContainers',function(){
		socket.emit('getRootContainers',rootContainers);
	})
	socket.on('disconnect', function(){
		console.log('user disconnected');
	});
});

/*setTimeout(()=>{
	createNewNginxNode();
},30000);*/
setTimeout(()=>{
	console.log(usedIps);
	console.log(onlineContainers);
	console.log(onlineNginxNodeContainers);
	console.log("requestsLimitToSpawn "+requestsLimitToSpawn);
	deleteNewNginxNode()
},3000);

// to put archive in container
//container.putArchive('index.tar', {path:'/usr/share/nginx/html'});
