var Docker = require('dockerode');
var docker = new Docker({socketPath: '/var/run/docker.sock'});
var usedIps = [];
var onlineContainers = [];
var rootContainers = {};
module.exports = {
	docker: docker,
	startContainer: function (containerType, containerName, containerBinds, containerIp, callback)
	{
		usedIps.push(containerIp);
		if(containerType == 'php-fpm')
		{
			docker.createContainer({Image: 'kisc/php-fpm-kisc', Cmd: [], name: containerName, HostConfig: {'Binds': containerBinds}, NetworkingConfig: { "EndpointsConfig": { "br0": { "IPAMConfig": { "IPv4Address": containerIp} } } }}, function (err, container) {
				if(err)
					console.log(err);
				container.start(function (err, data) {
					if(err)
						console.log(err);
				});
				//inspect para retornar o nome e ip da maquina iniciada
				container.inspect(function (err, data) {
					if(err)
					{
						console.log(err);
					}
					else
					{
						setTimeout(function(){
							return callback(data, false);
						},3000);
					}
				});
			});
		}
		else if(containerType == 'mysql-server')
		{
			//MYSQL_ROOT_PASSWORD para password do root & MYSQL_DATABASE para base de dados que é criada com o binding no docker-entrypoint-initdb.d
			docker.createContainer({Image: 'mariadb', Cmd: ['mysqld'], name: containerName, Env:['MYSQL_ROOT_PASSWORD=root','MYSQL_DATABASE=wordpress'], HostConfig: {'Binds': containerBinds}, NetworkingConfig: { "EndpointsConfig": { "br0": { "IPAMConfig": { "IPv4Address": containerIp} } } }}, function (err, container) {
				if(err)
					console.log(err);
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
					if(err)
						console.log(err);
				});
				//inspect para retornar o nome e ip da maquina iniciada
				container.inspect(function (err, data) {
					if(err)
					{
						console.log(err);
					}
					else
					{
						setTimeout(function(){
							return callback(data, false);
						},3000);
					}
				});
			});
		}
		else if(containerType == 'nginx')
		{
			if(containerName == 'cwc-nginxlb-master')
			{
				docker.createContainer({Image: 'kisc/nginx-telegraf', Cmd: ['/bin/bash', '-c', "service telegraf start ; mkdir -p /var/cache/nginx/fpc ; nginx -g 'daemon off;'"], name: containerName, 'ExposedPorts': { '80/tcp': {} }, HostConfig: {'Binds': containerBinds, "PortBindings": { "80/tcp": [{ "HostPort": "80" }] }}, NetworkingConfig: { "EndpointsConfig": { "br0": { "IPAMConfig": { "IPv4Address": containerIp} } } }}, function (err, container) {
					if(err)
						console.log(err);
					container.start(function (err, data) {
						if(err)
							console.log(err);
					});
					//inspect para retornar o nome e ip da maquina iniciada
					container.inspect(function (err, data) {
						if(err)
						{
							console.log(err);
						}
						else
						{
							setTimeout(function(){
								return callback(data, false);
							},3000);
						}
					});
				});
			}
			else
			{
				docker.createContainer({Image: 'kisc/nginx-telegraf', Cmd: ['/bin/bash', '-c', "service telegraf start ; nginx -g 'daemon off;'"], name: containerName, HostConfig: {'Binds': containerBinds}, NetworkingConfig: { "EndpointsConfig": { "br0": { "IPAMConfig": { "IPv4Address": containerIp} } } }}, function (err, container) {
					if(err)
						console.log(err);
					container.start(function (err, data) {
						if(err)
							console.log(err);
					});
					//inspect para retornar o nome e ip da maquina iniciada
					container.inspect(function (err, data) {
						if(err)
						{
							console.log(err);
						}
						else
						{
							setTimeout(function(){
								return callback(data, false);
							},3000);
						}
					});
				});
			}
		}
		else if(containerType == "influxdb")
		{
			docker.createContainer({Image: 'influxdb', Cmd: [], name: containerName, HostConfig: {'Binds': containerBinds}, NetworkingConfig: { "EndpointsConfig": { "br0": { "IPAMConfig": { "IPv4Address": containerIp} } } }}, function (err, container) {
				if(err)
					console.log(err);
				container.start(function (err, data) {
					if(err)
						console.log(err);;
				});
				//inspect para retornar o nome e ip da maquina iniciada
				container.inspect(function (err, data) {
					if(err)
					{
						console.log(err);
					}
					else
					{
						setTimeout(function(){
							return callback(data, false);
						},3000);
					}
				});
			});
		}
		else if(containerType == "grafana")
		{
			docker.createContainer({Image: 'tiagosantana/grafana', Cmd: [], name: containerName, 'ExposedPorts': { '3001/tcp': {} }, HostConfig: {'Binds': containerBinds, "PortBindings": {'3000/tcp': [{ "HostPort": '3001' }]}}, NetworkingConfig: { "EndpointsConfig": { "br0": { "IPAMConfig": { "IPv4Address": containerIp} } } } }, function (err, container) {
				if(err)
					console.log(err);
				container.start(function (err, data) {
					if(err)
						console.log(err);
				});
				//inspect para retornar o nome e ip da maquina iniciada
				container.inspect(function (err, data) {
					if(err)
					{
						console.log(err);
					}
					else
					{
						setTimeout(function(){
							return callback(data, false);
						},3000);
					}
				});
			});
		}
	},
	getContainerDataRunning: function (id,initialStart)
	{
		//inspeciona o container dado pelo id
		if(initialStart)
		{
			let container = docker.getContainer(id);
			container.inspect(function (err, data) {
				usedIps.push(data.NetworkSettings.Networks.br0.IPAddress);
				onlineContainers.push({name:data.Name.substring(1,data.Name.length), id:data.Id, ip:data.NetworkSettings.Networks.br0.IPAddress, hostname:id});
				console.log(data.Name + ' ' + data.NetworkSettings.Networks.br0.IPAddress + ' Online');
			});
		}
		else
		{
			let container = docker.getContainer(id);
			container.inspect(function (err, data) {
				onlineContainers.push({name:data.Name.substring(1,data.Name.length), id:data.Id, ip:data.NetworkSettings.Networks.br0.IPAddress,hostname:id});
				console.log(data.Name + ' ' + data.NetworkSettings.Networks.br0.IPAddress + ' Online');
			});
		}
	},
	setReservedIps: function(reservedIps)
	{
		usedIps = usedIps.concat(reservedIps);
	},
	setRootContainers: function(_rootContainers)
	{
		rootContainers = _rootContainers;
	},
	getUsedIps: function(callback)
	{
		return callback(usedIps);
	},
	removeFromUsedIps: function(onlineNginxContainer)
	{
		usedIps = arrayRemove(usedIps, onlineNginxContainer.ip);
	},
	getOnlineContainers: function(callback)
	{
		return callback(onlineContainers);
	},
	findOnlineContainers: function(containerName,callback)
	{
		return callback(search(containerName, onlineContainers));
	},
	removeFromOnlineContainers: function(onlineNginxContainer)
	{
		onlineContainers = arrayRemove(onlineContainers, onlineNginxContainer);
	},
	getLoadBalancerContainerId: function(callback)
	{
		let nginxlbId;
		for (let i = 0; i < onlineContainers.length; i++) {
			if(onlineContainers[i].name == rootContainers.nginxlb.name)
			{
				nginxlbId = onlineContainers[i].id;
			}
		}
		return callback(nginxlbId);
	},
	getNonUsedIp: function(callback)
	{
		let randomIp;
		while (true) 
		{
			randomIp = "172.18.0."+(Math.floor(Math.random() * 252) + 2);
		    //verify if ip is not in use
		    if(!usedIps.includes(randomIp))
		    {
		    	console.log(randomIp);
		    	break;
		    }
		}
		return callback(randomIp);
	}

};
// remove some key/value from array
function arrayRemove(arr, value) {

   return arr.filter(function(ele){
       return ele != value;
   });

}
// function to search namekey in some array
function search(nameKey, myArray){
    for (var i=0; i < myArray.length; i++) {
        if (myArray[i].name === nameKey) {
            return myArray[i];
        }
    }
}