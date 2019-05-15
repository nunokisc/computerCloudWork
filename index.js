var Docker = require('dockerode');
var docker = new Docker({socketPath: '/var/run/docker.sock'});
var app = require('express')();
var http = require('http').createServer(app);

docker.listContainers(function (err, containers) {
	if(containers.length > 0)
	{
		containers.forEach(function (containerInfo) {
			//console.log(containerInfo.Names[0]);
			getContainerDataRunning(containerInfo.Id);
		});
	}
	else
	{
		console.log("No containers running");
		startContainer('nginx', 'nginx-sv1', ['/home/nuno/computerCloudWork/html:/var/www/html','/home/nuno/computerCloudWork/http/conf.d:/etc/nginx/conf.d']);
		startContainer('php-fpm', 'php-fpm-sv1', ['/home/nuno/computerCloudWork/html:/var/www/html'])
		startContainer('mysql-server', 'mysql-server', ['/home/nuno/computerCloudWork/db:/docker-entrypoint-initdb.d/']);
		startContainer('nginx', 'nginx-lb1', ['/home/nuno/computerCloudWork/loadbalancer/conf.d:/etc/nginx/conf.d']);
	}
});

function getContainerDataRunning(id)
{
	let container = docker.getContainer(id);
	container.inspect(function (err, data) {
		console.log(data.Name + ' ' + data.NetworkSettings.IPAddress + ' Online');
	});

}

function startContainer(containerType, containerName, containerBinds)
{
	if(containerType == 'php-fpm')
	{
		docker.createContainer({Image: 'kisc/php-fpm-kisc', Cmd: [], name: containerName, HostConfig: {'Binds': containerBinds}}, function (err, container) {
			container.start(function (err, data) {
				console.log(data);
			});
			container.inspect(function (err, data) {
				setTimeout(function(){
					getContainerDataRunning(data.Config.Hostname);
				},3000);
			});
		});
	}
	else if(containerType == 'mysql-server')
	{
		docker.createContainer({Image: 'mariadb', Cmd: ['mysqld'], name: containerName, Env:['MYSQL_ROOT_PASSWORD=root','MYSQL_DATABASE=wordpress'], HostConfig: {'Binds': containerBinds}}, function (err, container) {

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
			container.inspect(function (err, data) {
				setTimeout(function(){
					getContainerDataRunning(data.Config.Hostname);
				},3000);
			});
		});
	}
	else if(containerType == 'nginx')
	{
		docker.createContainer({Image: 'nginx', Cmd: ['nginx', '-g', 'daemon off;'], name: containerName, HostConfig: {'Binds': containerBinds}}, function (err, container) {
			container.start(function (err, data) {
				console.log(data);
			});
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