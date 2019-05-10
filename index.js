var Docker = require('dockerode');
var docker = new Docker({socketPath: '/var/run/docker.sock'});

docker.createContainer({Image: 'nginx', Cmd: ['nginx', '-g', 'daemon off;'], name: 'nginx-loadbalancer'}, function (err, container) {
	container.start(function (err, data) {
		console.log(data);
	});
	container.inspect(function (err, data) {
		console.log(data);
	});
	container.putArchive('index.tar', {path:'/usr/share/nginx/html'});
	//container.remove();

});

docker.createContainer({Image: 'mysql', Cmd: ['mysqld'], name: 'mysql-server', Env:['MYSQL_ROOT_PASSWORD=root']}, function (err, container) {
	container.start(function (err, data) {
		console.log(data);
	});
	container.inspect(function (err, data) {
		console.log(data);
	});
	//container.remove();

});