var absolutePath = __dirname;
var containerInitials = "cwc";
var rootContainers = {
	"nginx": {name:'cwc-nginx-sv1', ip:"172.18.0.3"},
	"php": {name:'cwc-php-fpm-sv1', ip:"172.18.0.5"},
	"mysql": {name:'cwc-mysql-sv', ip:"172.18.0.4"},
	"nginxlb": {name:'cwc-nginx-lb1', ip:"172.18.0.2"},
	"influxdb": {name:'cwc-influxdb-sv', ip:"172.18.0.6"},
	"telegraf": {name:'cwc-telegraf-sv', ip:"172.18.0.7"}
};

var Docker = require('dockerode');
var docker = new Docker({socketPath: '/var/run/docker.sock'});
const Influx = require('influx')
const influx = new Influx.InfluxDB({
  host: rootContainers.influxdb.ip,
  database: 'telegraf'
})
var app = require('express')();
var http = require('http').createServer(app);
var usedIps = [];
var onlineContainers = [];
var requestsPerSecond = 0;
var activeConnections = 0;
console.log(absolutePath);
docker.listContainers(function (err, containers) {
	//verificar se existem containers a correr
	let counter = 0;
	if(containers.length > 0)
	{
		//retornar o nome e ip da maquina iniciada
		containers.forEach(function (containerInfo) {
			//console.log(containerInfo.Names[0]);

			// verficiar se o container é cwc
			if(containerInfo.Names[0].substring(1,4) == containerInitials)
			{
				getContainerDataRunning(containerInfo.Id);
				counter ++;
			}

			// verifica se o container é o influxdb
			if(containerInfo.Names[0].substring(1,containerInfo.Names[0].length) == rootContainers.influxdb.name)
			{
				setInterval(getActiveConnections,1000);
				setInterval(getRequestsPerSecond,1000);
			}
		});
	}
	// caso não exista nenhum container que seja cwc
	if(counter == 0)
	{
		// iniciar maquinas root
		console.log("No containers running");
		startContainer('nginx', rootContainers.nginx.name, [absolutePath+'/html:/var/www/html',absolutePath+'/http/conf.d:/etc/nginx/conf.d'],rootContainers.nginx.ip);
		startContainer('php-fpm', rootContainers.php.name, [absolutePath+'/html:/var/www/html'],rootContainers.php.ip)
		startContainer('mysql-server', rootContainers.mysql.name, [absolutePath+'/db:/docker-entrypoint-initdb.d/'],rootContainers.mysql.ip);
		startContainer('nginx', rootContainers.nginxlb.name, [absolutePath+'/loadbalancer/conf.d:/etc/nginx/conf.d'],rootContainers.nginxlb.ip);
		startContainer('influxdb', rootContainers.influxdb.name, [],rootContainers.influxdb.ip);
		startContainer('telegraf', rootContainers.telegraf.name, [absolutePath+'/telegraf:/etc/telegraf'],rootContainers.telegraf.ip);
	}
});

function getRequestsPerSecond()
{
	influx.query('SELECT derivative(max(requests)) as requestsPerSecond FROM nginx where time > now() - 30s GROUP BY time(1s)').then(results => {
		requestsPerSecond = results[0].requestsPerSecond;
	  	console.log(results[0].requestsPerSecond);
	})
}

function getActiveConnections()
{
	influx.query('SELECT LAST(active) as activeConnections FROM nginx').then(results => {
		activeConnections = results[0].activeConnections;
	  	console.log(results[0].activeConnections);
	})
}

function getContainerDataRunning(id)
{
	//inspeciona o container dado pelo id
	let container = docker.getContainer(id);
	container.inspect(function (err, data) {
		usedIps.push({name:data.Name, ip:data.NetworkSettings.Networks.br0.IPAddress});
		onlineContainers.push({name:data.Name ,id:data.Id ,ip:data.NetworkSettings.Networks.br0.IPAddress});
		console.log(data.Name + ' ' + data.NetworkSettings.Networks.br0.IPAddress + ' Online');
	});

}

function createNewNginxNode()
{

}

// Iniciar container do tipo x com o nome x com array de binds e com o ip x (verficar se não esta em uso)
function startContainer(containerType, containerName, containerBinds, containerIp)
{
	if(containerType == 'php-fpm')
	{
		docker.createContainer({Image: 'kisc/php-fpm-kisc', Cmd: [], name: containerName, HostConfig: {'Binds': containerBinds}, NetworkingConfig: { "EndpointsConfig": { "br0": { "IPAMConfig": { "IPv4Address": containerIp} } } }}, function (err, container) {
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
					getContainerDataRunning(data.Config.Hostname);
				},3000);
			});
		});
	}
	else if(containerType == 'nginx')
	{
		docker.createContainer({Image: 'nginx', Cmd: ['nginx', '-g', 'daemon off;'], name: containerName, HostConfig: {'Binds': containerBinds}, NetworkingConfig: { "EndpointsConfig": { "br0": { "IPAMConfig": { "IPv4Address": containerIp} } } }}, function (err, container) {
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
	else if(containerType == "influxdb")
	{
		docker.createContainer({Image: 'influxdb', Cmd: [], name: containerName, HostConfig: {'Binds': containerBinds}, NetworkingConfig: { "EndpointsConfig": { "br0": { "IPAMConfig": { "IPv4Address": containerIp} } } }}, function (err, container) {
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
					setInterval(getActiveConnections,1000);
					setInterval(getRequestsPerSecond,1000);
				},30000);
			});
		});
	}
}


app.get('/', function(req, res){
	res.send('<h1>computerCloudWork</h1>');
});

http.listen(3000, function(){
	console.log('listening on *:3000');
});

// to put archive in container
//container.putArchive('index.tar', {path:'/usr/share/nginx/html'});
