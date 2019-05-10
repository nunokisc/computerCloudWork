var Docker = require('dockerode');
var docker = new Docker({socketPath: '/var/run/docker.sock'});
var containersIDs = [];

//RUN SYSTEM CONTAINERS IF THEY'RE NOT RUNNING
docker.createContainer({Image: 'nginx', Cmd: ['nginx', '-g', 'daemon off;'], name: 'nginx-sv1'}, function (err, container) {
	container.start(function (err, data) {
		console.log(data);
	});
	container.inspect(function (err, data) {
		containersIDs.push(data.Config.Hostname);
		setTimeout(function(){
			getContainerDataRunning(data.Config.Hostname);
		},3000);
	});
	container.putArchive('index.tar', {path:'/usr/share/nginx/html'});
	//container.remove();

});

docker.createContainer({Image: 'mysql', Cmd: ['mysqld'], name: 'mysql-server', Env:['MYSQL_ROOT_PASSWORD=root','MYSQL_DATABASE=teste_grafana'], HostConfig: {'Binds': ['/home/nuno/computerCloudWork/db:/docker-entrypoint-initdb.d/']}}, function (err, container) {

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

docker.listContainers(function (err, containers) {

    containersIDs.push(containers.Config.Hostname);

});

function getContainerDataRunning(id)
{
	let container = docker.getContainer(id);
	container.inspect(function (err, data) {
		console.log(data);
	});

}