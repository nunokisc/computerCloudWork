var containers = require('./containers.js');
var NginxConfFile = require('nginx-conf').NginxConfFile;
const fs = require('fs')
var onlineNginxNodeContainers = [];
var timeOutDel = [];
module.exports = {
	createNewNginxNode: function(absolutePath,callback) 
	{
		console.log(absolutePath);
		let randomPhpIp = "";
		let randomNginxIp = "";
		let containerNumber = Math.random().toString(36).substr(2, 9);
		//push to array new nginx node container
		onlineNginxNodeContainers.push({name: 'cwc-nginx-'+containerNumber});
		// generate new ip /24
		containers.getNonUsedIp(function(randomPhpIp){
			//start phpfpm node container
			containers.startContainer('php-fpm', 'cwc-php-fpm-'+containerNumber, [absolutePath+'/html:/var/www/html'],randomPhpIp, function (data, initialStart)
			{
				containers.getContainerDataRunning(data.Config.Hostname,initialStart);
				//create nginx node conf file
				NginxConfFile.create(absolutePath+'/http/conf.d/default.conf', function(err, conf) 
				{
					if (err) 
					{
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
				containers.getNonUsedIp(function(randomNginxIp)
				{
					// start nginx node container
					containers.startContainer('nginx', 'cwc-nginx-'+containerNumber, [absolutePath+'/html:/var/www/html',absolutePath+'/http/conf.d/0-default.conf:/etc/nginx/conf.d/0-default.conf',absolutePath+'/http/conf.d/cwc-nginx-'+containerNumber+'.conf:/etc/nginx/conf.d/default.conf'],randomNginxIp, function (data, initialStart){
						containers.getContainerDataRunning(data.Config.Hostname,initialStart);
						//add ip of new nginx node container to loadbalancer conf
						NginxConfFile.create(absolutePath+'/loadbalancer/conf.d/0-default.conf', function(err, conf) 
						{
							if (err) 
							{
								console.log(err);
								return;
							}
							conf.nginx.upstream._add('server', randomNginxIp);
						});
						containers.getLoadBalancerContainerId(function(nginxlbId){
							for (let i = 0 ; i < nginxlbId.length; i++) 
							{
								let container = containers.docker.getContainer(nginxlbId[i].id);
								let options = {
									Cmd: ['/usr/sbin/nginx', '-s', 'reload'],
									AttachStdout: true,
									AttachStderr: true
								};
								//reload nginx service in loadbalancer 
								container.exec(options, function(err, exec) 
								{
									if (err) return;
									exec.start(function(err, stream) 
									{
										if (err) return;

										container.modem.demuxStream(stream, process.stdout, process.stderr);

										exec.inspect(function(err, data) 
										{
											if (err) return;
											console.log(data);

										});
									});
								});
							}
							return callback();
						})
					})
				})
			});
		})
	},
	deleteNewNginxNode: function(absolutePath,nodeName,callback)
	{
		//verifica se existem nodes extra activos
		if(onlineNginxNodeContainers.length > 0)
		{
			let containerName = nodeName;
			console.log(containerName);
			// faz um substring para obter o numero do container apartir do nome
			let containersNumber = containerName.substring(containerName.length-9,containerName.length);
			console.log(containersNumber);

			onlineNginxNodeContainers = arrayRemove(onlineNginxNodeContainers,search(nodeName,onlineNginxNodeContainers));
			// pesquisa no array onlineContainers o container name e retorna o objecto
			containers.findOnlineContainers(containerName, function(onlineNginxContainer)
			{
				// get container by id
				let containerNginx = containers.docker.getContainer(onlineNginxContainer.id);
				// remove container e ip dos arrays
				containers.removeFromUsedIps(onlineNginxContainer);
				containers.removeFromOnlineContainers(onlineNginxContainer);
				
				console.log(onlineNginxContainer.id);
				// pesquisa no array onlineContainers o container name e retorna o objecto
				containers.findOnlineContainers("cwc-php-fpm-"+containersNumber, function(onlineFpmContainer)
				{
					// get container by id
					let containerFpm = containers.docker.getContainer(onlineFpmContainer.id);
					// remove container e ip dos arrays
					containers.removeFromUsedIps(onlineFpmContainer);
					containers.removeFromOnlineContainers(onlineFpmContainer);
					//get lb container by id
					containers.getLoadBalancerContainerId(function(nginxlbId)
					{
						
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
							NginxConfFile.create(absolutePath+'/loadbalancer/conf.d/0-default.conf', function(err, conf) 
							{
								if (err) 
								{
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

							for (let i = 0 ; i < nginxlbId.length; i++) 
							{
								let container = containers.docker.getContainer(nginxlbId[i].id);
								let options = {
									Cmd: ['/usr/sbin/nginx', '-s', 'reload'],
									AttachStdout: true,
									AttachStderr: true
								};
								//reload nginx service in loadbalancer 
								container.exec(options, function(err, exec) 
								{
									if (err) return;
									exec.start(function(err, stream) 
									{
										if (err) return;

										container.modem.demuxStream(stream, process.stdout, process.stderr);

										exec.inspect(function(err, data) 
										{
											if (err) return;
											console.log(data);

										});
									});
								});
							}
							return callback(containerName);
						});
					})
				})
			})
		}
	},
	deleteNewNginxNodeWithTimeout: function(absolutePath,callback)
	{
		module.exports.getNonTimeOutDel(function(nginxNode)
		{
			timeOutDel.push(
				{
					name:nginxNode.name,
					timeout:setTimeout(()=>{
						module.exports.deleteNewNginxNode(absolutePath,nginxNode.name,function(containerName)
						{
							timeOutDel = arrayRemove(timeOutDel,search(containerName,timeOutDel));
							callback(containerName+" eliminado");
						})
					},30000)
				}
			)
		})
		
	},
	getOnlineNginxNodeContainers: function(callback)
	{
		return callback(onlineNginxNodeContainers);
	},
	setOnlineNginxNodeContainers: function(nginxContainer)
	{
		onlineNginxNodeContainers.push(nginxContainer);
	},
	clearTimeOutDel: function()
	{
		clearTimeout(timeOutDel[timeOutDel.length-1].timeout);
		timeOutDel.splice(timeOutDel.length-1,1);
	},
	getTimeOutDel: function(callback)
	{
		return callback(timeOutDel);
	},
	getNonTimeOutDel: function(callback)
	{
		let nginxNode = {};
		if(timeOutDel.length > 0)
		{
			let exists = 0;
			console.log("entrou no timeOutDel.length > 0");
			for (let i = 0; i < onlineNginxNodeContainers.length; i++) 
			{
				exists = 0;
				for (let l = 0; l < timeOutDel.length; l++) 
				{
					if(timeOutDel[l].name == onlineNginxNodeContainers[i].name)
					{
						exists = 1;
					}	
				}
				if(exists == 0)
				{
					nginxNode = onlineNginxNodeContainers[i];
					console.log(nginxNode);
					break;
				}
			}
		}
		else
		{
			console.log("não entrou no timeOutDel.length > 0");
			nginxNode = onlineNginxNodeContainers[0];
			console.log(nginxNode);
		}
		return callback(nginxNode);
	}
};
// remove some key/value from array
function arrayRemove(arr, value) 
{
   return arr.filter(function(ele)
   {
       return ele != value;
   });

}
// function to search namekey in some array
function search(nameKey, myArray){
    for (var i=0; i < myArray.length; i++) 
    {
        if (myArray[i].name === nameKey) 
        {
            return myArray[i];
        }
    }
}
