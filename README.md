# computerCloudWork

Este projecto consistem em escalar automaticamente em Docker um site em Wordpress dependendo dos pedidos por segundo recebidos.
Desenvolvido em node.JS com o dockerode.

# Run

    docker pull nginx
    docker pull kisc/php-fpm-kisc
    docker pull mariadb
    docker network create --driver=bridge --subnet=172.18.0.0/16 br0
    add to hosts file "172.18.0.2 www.computercloud.work"
    
   After: 
   
	node index.js

# State

 - [x] Iniciar container LoadBalancer - Nginx
 - [x] Iniciar container HTTP - Nginx
 - [x] Iniciar container Mysql - Nginx
 - [x] Iniciar container PHP - php-fpm
 - [ ] Iniciar container InfluxDB
 - [ ] Iniciar container Telegraf
 - [ ] Adicionar containers LoadBalancer consoante a carga
 - [ ] Adicionar containers HTTP e PHP consoante a carga até um maximo de x por LoadBalancer
 - [ ] Configurar novos containers no LoadBalancer
