import cdk = require('@aws-cdk/core');
import ecr = require('@aws-cdk/aws-ecr');
import ecs = require('@aws-cdk/aws-ecs');
import ecsPatterns = require('@aws-cdk/aws-ecs-patterns');
import * as logs from '@aws-cdk/aws-logs';
import { Vpc, Subnet, SubnetType } from '@aws-cdk/aws-ec2';

export class CdkStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // const vpc = new Vpc(this, 'Vpc', {
    //   cidr: '10.1.0.0/16',
    //   maxAzs: 2,
    //   natGateways: 1,
    //   subnetConfiguration: [
    //     {
    //       cidrMask: 24,
    //       name: 'ingress',
    //       subnetType: SubnetType.PUBLIC
    //     },
    //     {
    //       cidrMask: 24,
    //       name: 'application',
    //       subnetType: SubnetType.PRIVATE
    //     }
    //   ]
    // })

    const defaultVPC = Vpc.fromLookup(this, 'DefaultVpc', {
      isDefault: true
    })

    console.log(defaultVPC.vpcId)
    console.log(defaultVPC.availabilityZones)
    console.log(defaultVPC.publicSubnets.map(x => x.subnetId))
    console.log(defaultVPC.privateSubnets.map(x => x.subnetId))

    const azs = [
      'ap-northeast-1c',
      'ap-northeast-1d'
    ]
    console.log('AZ in VPC: ', azs)
    let publicSubnetCandidates = []
    let privateSubnetCandidates = []

    publicSubnetCandidates.push(
      defaultVPC.publicSubnets.find(ps => {
        return ps.availabilityZone === azs[0]
      }),
      defaultVPC.publicSubnets.find(ps => {
        return ps.availabilityZone === azs[1]
      })
    )
    privateSubnetCandidates.push(
      defaultVPC.privateSubnets.find(ps => {
        return ps.availabilityZone === azs[0]
      }),
      defaultVPC.privateSubnets.find(ps => {
        return ps.availabilityZone === azs[1]
      })
    )

    publicSubnetCandidates = publicSubnetCandidates.map(n => n && n.subnetId || '').filter(n => n)
    privateSubnetCandidates = privateSubnetCandidates.map(n => n && n.subnetId || '').filter(n => n)

    console.log('publicSubnetCandidates: ', publicSubnetCandidates)
    console.log('privateSubnetCandidates: ', privateSubnetCandidates)

    const vpc = Vpc.fromVpcAttributes(this, 'Vpc', {
      vpcId: defaultVPC.vpcId,
      availabilityZones: azs,
      publicSubnetIds: publicSubnetCandidates,
      privateSubnetIds: privateSubnetCandidates
    })

    const cluster = new ecs.Cluster(this, 'Cluster', {
      vpc
    })

    const taskDef = new ecs.TaskDefinition(this, 'Task', {
      compatibility: ecs.Compatibility.FARGATE,
      cpu: '1024',
      memoryMiB: '2048',
    })

    const nginxRepo = ecr.Repository.fromRepositoryName(
      this,
      'Nginx',
      'cdk/cdkstack3tasknginxassetimageb9a1fb19'
    )

    const nginx = taskDef.addContainer('nginx', {
      image: ecs.ContainerImage.fromEcrRepository(nginxRepo, 'latest'),
      logging: ecs.AwsLogDriver.awsLogs({
        logRetention: logs.RetentionDays.ONE_MONTH,
        streamPrefix: 'nginx'
      })
    })

    nginx.addPortMappings({
      containerPort: 80
    })

    const expressRepo = ecr.Repository.fromRepositoryName(
      this,
      'Express',
      'cdk/cdkstack3taskexpressassetimageae77c1b8'
    )

    const express = taskDef.addContainer('express', {
      image: ecs.ContainerImage.fromEcrRepository(expressRepo, 'latest'),
      logging: ecs.AwsLogDriver.awsLogs({
        logRetention: logs.RetentionDays.ONE_MONTH,
        streamPrefix: 'express'
      })
    })


    const svc = new ecsPatterns.ApplicationLoadBalancedFargateService(this, 'Svc', {
      taskDefinition: taskDef,
      cluster,
      assignPublicIp: true,
      listenerPort: 80
    })

    svc.targetGroup.setAttribute('deregistration_delay.timeout_seconds', '30')
    svc.targetGroup.configureHealthCheck({
      interval: cdk.Duration.seconds(5),
      healthyHttpCodes: '200',
      healthyThresholdCount: 2,
      unhealthyThresholdCount: 3,
      timeout: cdk.Duration.seconds(4),
    })
  }
}
