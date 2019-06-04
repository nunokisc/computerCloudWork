var containers = require('./containers.js');
var NginxConfFile = require('nginx-conf').NginxConfFile;
const fs = require('fs')
var onlineNginxLbNodeContainers = [];
var timeOutDel = [];
module.exports = {
	createNewNginxLbNode: function(absolutePath,callback) 
	{
		// use a reserved ip
		containers.getReservedIps(function(reservedIps)
		{
			if(onlineNginxLbNodeContainers.length < reservedIps.length)
			{
				let containerNumber = Math.random().toString(36).substr(2, 9);
				//push to array new nginx node container
				onlineNginxLbNodeContainers.push({name: 'cwc-nginxlb-'+containerNumber});
				//create nginx node conf file
				NginxConfFile.create(absolutePath+'/loadbalancer/conf.d/10-default.conf', function(err, conf) 
				{
					if (err) 
					{
						console.log(err);
						return;
					}
					//reading values
					conf.nginx.server.location.add_header[1]._value = "X-LB cwc-nginxlb-"+containerNumber;
					conf.live(absolutePath+'/loadbalancer/conf.d/cwc-nginxlb-'+containerNumber+'.conf');
					conf.die(absolutePath+'/loadbalancer/conf.d/10-default.conf');
				});
			
				//start phpfpm node container
				containers.startContainer('nginx', 'cwc-nginxlb-'+containerNumber, [absolutePath+'/loadbalancer/conf.d/0-default.conf:/etc/nginx/conf.d/0-default.conf',absolutePath+'/loadbalancer/conf.d/cwc-nginxlb-'+containerNumber+'.conf:/etc/nginx/conf.d/10-default.conf',absolutePath+'/loadbalancer/conf.d/11-default.conf:/etc/nginx/conf.d/11-default.conf',absolutePath+'/telegraf:/etc/telegraf'],reservedIps[onlineNginxLbNodeContainers.length-1], function (data, initialStart)
				{
					containers.getContainerDataRunning(data.Config.Hostname,initialStart);
					return callback();
				});
			}
			else
			{
				console.log("Limite de loadbalancers atingido");
			}
		})
	},
	deleteNewNginxLbNode: function(absolutePath,nodeName,callback)
	{
		//verifica se existem nodes extra activos
		if(onlineNginxLbNodeContainers.length > 0)
		{
			let containerName = nodeName;
			console.log(containerName);
			// faz um substring para obter o numero do container apartir do nome
			let containersNumber = containerName.substring(containerName.length-9,containerName.length);
			console.log(containersNumber);

			onlineNginxLbNodeContainers = arrayRemove(onlineNginxLbNodeContainers,search(nodeName,onlineNginxLbNodeContainers));

			// pesquisa no array onlineContainers o container name e retorna o objecto
			containers.findOnlineContainers(containerName, function(onlineNginxLbContainer)
			{
				// get container by id
				let containerNginxLb = containers.docker.getContainer(onlineNginxLbContainer.id);
				// remove container
				containers.removeFromOnlineContainers(onlineNginxLbContainer);

				console.log(onlineNginxLbContainer.id);

				// stop nginx node container
				containerNginxLb.stop(function(){
					// remove nginx node config from conf.d
					fs.unlink(absolutePath+"/loadbalancer/conf.d/"+containerName+".conf", (err) => {
						if (err) {
							console.error(err)
							return
						}
					})
					//remove nginx node container
					containerNginxLb.remove();

					return callback(containerName);
				});
			});
		}
	},
	deleteNewNginxLbNodeWithTimeout: function(absolutePath,callback)
	{
		module.exports.getNonTimeOutDel(function(nginxLbNode)
		{
			timeOutDel.push(
				{
					name:nginxLbNode.name,
					timeout:setTimeout(()=>{
						module.exports.deleteNewNginxLbNode(absolutePath,nginxLbNode.name,function(containerName)
						{
							timeOutDel = arrayRemove(timeOutDel,search(containerName,timeOutDel));
							callback(containerName+" eliminado");
						})
					},30000)
				}
			)
		})
		
	},
	getOnlineNginxLbNodeContainers: function(callback)
	{
		return callback(onlineNginxLbNodeContainers);
	},
	setOnlineNginxLbNodeContainers: function(nginxLbContainer)
	{
		onlineNginxLbNodeContainers.push(nginxLbContainer);
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
			for (let i = 0; i < onlineNginxLbNodeContainers.length; i++) 
			{
				exists = 0;
				for (let l = 0; l < timeOutDel.length; l++) 
				{
					if(timeOutDel[l].name == onlineNginxLbNodeContainers[i].name)
					{
						exists = 1;
					}	
				}
				if(exists == 0)
				{
					nginxNode = onlineNginxLbNodeContainers[i];
					console.log(nginxNode);
					break;
				}
			}
		}
		else
		{
			console.log("não entrou no timeOutDel.length > 0");
			nginxNode = onlineNginxLbNodeContainers[0];
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
function search(nameKey, myArray)
{
    for (var i=0; i < myArray.length; i++) 
    {
        if (myArray[i].name === nameKey) 
        {
            return myArray[i];
        }
    }
}
