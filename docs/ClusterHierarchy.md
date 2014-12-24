# Cluter Heirarchy

It is important to adhere to the OOSE cluster layout even at the most granular level and the smallest cluster deployments.
Clusters are split into 5 basic levels in order of highest to lowest.

* Domain
* Site
* Zone
* Host
* Media

### Domain
In order to identify a cluster a domain should be used. This domain should be a SLD but it can also be a subdomain however it makes the naming structure longer in production.
For our production purposes oose.io is used as the domain. For a more local enterprise instance however a subdomain could be used, for example: oose.esited.net

### Site
To identify geographic locations, sites are used. These give just enough information to identify the location of the OOSE site. Sites are used to identify groups of hosts that are located on the same physical network.
For our production purposes we use a site naming convention that looks like the following.

`<nearest major airport code><site #>`

For us this equates to for example: lax1. Which would yield Los Angeles, CA; Site # 1

### Zone

Zones are used to identify groups of hardware that are connected to the same physical switch or power source.
In our case we use the switch tag to indentify hosts that are connected to the same physical switch. Which would yield content unavailable during the case of a switch outage or maintenance.

Example: **rs106a**

### Host
Since OOSE can host multiple forms of media from the host we treat the host as merely a container where OOSE instance are spawned and maintained.
We use the chassis asset tag for our hosts but this can be any identifying information that correlates to a physical host. Usually the short hostname, for example: h223

### Media (aka instance ID)
The last and most specific portion of the layout is the actual physical media where data is stored. These are most always some form of Hard Drive (HDD, or SSD). However this could point to a network location or any other form of available media that can expose a POSIX filesystem.
It is important for the media identifier to be unique as it can migrate to a different location and needs to maintain its identify when compared with other instances.
We prefix our instance ID's with OM for OOSE Media. And then use a simple numbering pattern starting at 101. So for example: om101

## Put it all Together
After all the formatting is in place and naming conventions have been decided on a FQDN can be ascertained against an instance of OOSE.

Example: **om101-h223-rs106a-lax1.oose.io**

This FQDN is very important for a few purposes.

* Maps to a physical drive and instance of OOSE for maintenance purposes
* Access to any data on the media via the network will use this hostname
* We use hyphens instead of subdomains for SSL purposes.

##Replication Considerations
When the OOSE system distributes data it tries send the data to a host on the same physical network, or in other words the same site as mentioned above. It will not however replicate to an instance on the same host as this would create the possibility for data to be unavailable in the event of a host going offline.

If there are multiple *zones* available OOSE will do its best to create copies of data that are independent of zones but still reside within the same site.

Inter-site copies are only used in geographic caching situations or if high availability of data is requested at the instance configuration level. Each instance will make decisions about where to send data there is no monolithic master that makes decisions. So, it is important to configure each instance with similar replication rules.