var containers = require('./containers.js');
var NginxConfFile = require('nginx-conf').NginxConfFile;
const fs = require('fs')
var onlineNginxNodeContainers = [];
module.exports = {
	createNewNginxNode: function(absolutePath,callback) {
		console.log(absolutePath);
		let randomPhpIp = "";
		let randomNginxIp = "";
		let containerNumber = Math.random().toString(36).substr(2, 9);
		//push to array new nginx node container
		onlineNginxNodeContainers.push({name: 'cwc-nginx-'+containerNumber});
		// generate new ip /24
		containers.getNonUsedIp(function(randomPhpIp){
			//start phpfpm node container
			containers.startContainer('php-fpm', 'cwc-php-fpm-'+containerNumber, [absolutePath+'/html:/var/www/html'],randomPhpIp, function (data, initialStart){
				containers.getContainerDataRunning(data.Config.Hostname,initialStart);
				//create nginx node conf file
				NginxConfFile.create(absolutePath+'/http/conf.d/default.conf', function(err, conf) {
					if (err) {
						console.log(err);
						return;
					}
					//reading values
					conf.nginx.server.add_header._value = "X_NODE cwc-nginx-"+containerNumber;
					conf.nginx.server.location[1].fastcgi_pass._value = randomPhpIp+":9000";
					conf.live(absolutePath+'/http/conf.d/cwc-nginx-'+containerNumber+'.conf');
					conf.die(absolutePath+'/http/conf.d/default.conf');
				});
				// generate new ip /24
				containers.getNonUsedIp(function(randomNginxIp){
					// start nginx node container
					containers.startContainer('nginx', 'cwc-nginx-'+containerNumber, [absolutePath+'/html:/var/www/html',absolutePath+'/http/conf.d/0-default.conf:/etc/nginx/conf.d/0-default.conf',absolutePath+'/http/conf.d/cwc-nginx-'+containerNumber+'.conf:/etc/nginx/conf.d/default.conf'],randomNginxIp, function (data, initialStart){
						containers.getContainerDataRunning(data.Config.Hostname,initialStart);
						//add ip of new nginx node container to loadbalancer conf
						NginxConfFile.create(absolutePath+'/loadbalancer/conf.d/0-default.conf', function(err, conf) {
							if (err) {
								console.log(err);
								return;
							}
							conf.nginx.upstream._add('server', randomNginxIp);
						});
						containers.getLoadBalancerContainerId(function(nginxlbId){
							let container = containers.docker.getContainer(nginxlbId);
							var options = {
								Cmd: ['/usr/sbin/nginx', '-s', 'reload'],
								AttachStdout: true,
								AttachStderr: true
							};
							//reload nginx service in loadbalancer 
							container.exec(options, function(err, exec) {
								if (err) return;
								exec.start(function(err, stream) {
									if (err) return;

									container.modem.demuxStream(stream, process.stdout, process.stderr);

									exec.inspect(function(err, data) {
										if (err) return;
										console.log(data);
										return callback();
									});
								});
							});
						})
					})
				})
			});
		})
	},
	deleteNewNginxNode: function(absolutePath,callback)
	{
		//verifica se existem nodes extra activos
		if(onlineNginxNodeContainers.length > 0)
		{
			// vai buscar o nome do container que esta no topo do array
			let containerName = onlineNginxNodeContainers[0].name;
			console.log(containerName);
			// faz um substring para obter o numero do container apartir do nome
			let containersNumber = containerName.substring(containerName.length-9,containerName.length);
			console.log(containersNumber);
			//apaga o registo do topo do array
			onlineNginxNodeContainers.shift();
			// pesquisa no array onlineContainers o container name e retorna o objecto
			containers.findOnlineContainers(containerName, function(onlineNginxContainer){
				// get container by id
				let containerNginx = containers.docker.getContainer(onlineNginxContainer.id);
				// remove container e ip dos arrays
				containers.removeFromUsedIps(onlineNginxContainer);
				containers.removeFromOnlineContainers(onlineNginxContainer);
				
				console.log(onlineNginxContainer.id);
				// pesquisa no array onlineContainers o container name e retorna o objecto
				containers.findOnlineContainers("cwc-php-fpm-"+containersNumber, function(onlineFpmContainer){
					// get container by id
					let containerFpm = containers.docker.getContainer(onlineFpmContainer.id);
					// remove container e ip dos arrays
					containers.removeFromUsedIps(onlineFpmContainer);
					containers.removeFromOnlineContainers(onlineFpmContainer);
					//get lb container by id
					containers.getLoadBalancerContainerId(function(nginxlbId){
						let container = containers.docker.getContainer(nginxlbId);
						// stop nginx node container
						containerNginx.stop(function(){
							// remove nginx node config from conf.d
							fs.unlink(absolutePath+"/http/conf.d/"+containerName+".conf", (err) => {
								if (err) {
									console.error(err)
									return
								}
							})
							// stop and remove fpm node container
							containerFpm.stop(function(){
								containerFpm.remove();
							});
							//remove nginx node container
							containerNginx.remove();
							//remove nginx node ip from loadbalancer conf.d
							NginxConfFile.create(absolutePath+'/loadbalancer/conf.d/0-default.conf', function(err, conf) {
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
								Cmd: ['/usr/sbin/nginx', '-s', 'reload'],
								AttachStdout: true,
								AttachStderr: true
							};
							//reload loadbalancer nginx
							container.exec(options, function(err, exec) {
								if (err) return;
								exec.start(function(err, stream) {
									if (err) return;

									container.modem.demuxStream(stream, process.stdout, process.stderr);

									exec.inspect(function(err, data) {
										if (err) return;
										console.log(data);
										return callback();
									});
								});
							});
						});
					})
				})
			})
		}
	},
	getOnlineNginxNodeContainers: function(callback)
	{
		return callback(onlineNginxNodeContainers);
	},
	setOnlineNginxNodeContainers: function(nginxContainer)
	{
		onlineNginxNodeContainers.push(nginxContainer);
	}
};
