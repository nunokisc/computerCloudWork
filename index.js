var Docker = require('dockerode');
var docker = new Docker({socketPath: '/var/run/docker.sock'});
var app = require('express')();
var http = require('http').createServer(app);
var usedIps = [];
var absolutePath = __dirname;
console.log(absolutePath);
docker.listContainers(function (err, containers) {
	//verificar se existem containers a correr
	if(containers.length > 0)
	{
		//retornar o nome e ip da maquina iniciada
		containers.forEach(function (containerInfo) {
			//console.log(containerInfo.Names[0]);
			getContainerDataRunning(containerInfo.Id);
		});
	}
	else
	{
		// iniciar maquinas root
		console.log("No containers running");
		startContainer('nginx', 'nginx-sv1', [absolutePath+'/html:/var/www/html',absolutePath+'/http/conf.d:/etc/nginx/conf.d'],"172.18.0.3");
		startContainer('php-fpm', 'php-fpm-sv1', [absolutePath+'/html:/var/www/html'],"172.18.0.5")
		startContainer('mysql-server', 'mysql-server', [absolutePath+'/db:/docker-entrypoint-initdb.d/'],"172.18.0.4");
		startContainer('nginx', 'nginx-lb1', [absolutePath+'/loadbalancer/conf.d:/etc/nginx/conf.d'],"172.18.0.2");
		startContainer('influxdb', 'influxdb-server', [],"172.18.0.6");
		startContainer('telegraf', 'telegraf-servers', [absolutePath+'/telegraf:/etc/telegraf'],"172.18.0.7");
	}
});

function getContainerDataRunning(id)
{
	//inspeciona o container dado pelo id
	let container = docker.getContainer(id);
	container.inspect(function (err, data) {
		usedIps.push(data.NetworkSettings.Networks.br0.IPAddress);
		console.log(data.Name + ' ' + data.NetworkSettings.Networks.br0.IPAddress + ' Online');
	});

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
