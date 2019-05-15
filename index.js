var Docker = require('dockerode');
var docker = new Docker({socketPath: '/var/run/docker.sock'});
var app = require('express')();
var http = require('http').createServer(app);

app.get('/', function(req, res){
  res.send('<h1>Hello world</h1>');
});

http.listen(3000, function(){
  console.log('listening on *:3000');
});
var containersIDs = [];

//RUN SYSTEM CONTAINERS IF THEY'RE NOT RUNNING ---------------------------------------------------------------------------------------------------------------------------

docker.createContainer({Image: 'nginx', Cmd: ['nginx', '-g', 'daemon off;'], name: 'nginx-sv1', HostConfig: {'Binds': ['/home/nuno/computerCloudWork/html:/var/www/html','/home/nuno/computerCloudWork/http/conf.d:/etc/nginx/conf.d']}}, function (err, container) {
	container.start(function (err, data) {
		console.log(data);
	});
	container.inspect(function (err, data) {
		containersIDs.push(data.Config.Hostname);
		setTimeout(function(){
			getContainerDataRunning(data.Config.Hostname);
		},3000);
	});

	// to put archive in container
	//container.putArchive('index.tar', {path:'/usr/share/nginx/html'});
	//container.remove();
});

docker.createContainer({Image: 'nginx', Cmd: ['nginx', '-g', 'daemon off;'], name: 'nginx-lb1', HostConfig: {'Binds': ['/home/nuno/computerCloudWork/loadbalancer/conf.d:/etc/nginx/conf.d']}}, function (err, container) {
	container.start(function (err, data) {
		console.log(data);
	});
	container.inspect(function (err, data) {
		containersIDs.push(data.Config.Hostname);
		setTimeout(function(){
			getContainerDataRunning(data.Config.Hostname);
		},3000);
	});

	// to put archive in container
	//container.putArchive('index.tar', {path:'/usr/share/nginx/html'});
	//container.remove();
});

docker.createContainer({Image: 'kisc/php-fpm-kisc', Cmd: [], name: 'php-fpm-sv1', HostConfig: {'Binds': ['/home/nuno/computerCloudWork/html:/var/www/html']}}, function (err, container) {
	container.start(function (err, data) {
		console.log(data);
	});
	container.inspect(function (err, data) {
		containersIDs.push(data.Config.Hostname);
		setTimeout(function(){
			getContainerDataRunning(data.Config.Hostname);
		},3000);
	});
});

docker.createContainer({Image: 'mariadb', Cmd: ['mysqld'], name: 'mysql-server', Env:['MYSQL_ROOT_PASSWORD=root','MYSQL_DATABASE=wordpress'], HostConfig: {'Binds': ['/home/nuno/computerCloudWork/db:/docker-entrypoint-initdb.d/']}}, function (err, container) {

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
		containersIDs.push(data.Config.Hostname);
		setTimeout(function(){
			getContainerDataRunning(data.Config.Hostname);
		},3000);
	});
	//container.remove();

});

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////


function getContainerDataRunning(id)
{
	let container = docker.getContainer(id);
	container.inspect(function (err, data) {
		console.log(data.Name)
		console.log(data.NetworkSettings.IPAddress);
	});

}