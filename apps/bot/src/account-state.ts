import type { Prisma, PrismaClient } from '@prisma/client';
export const TELEGRAM_CONSENT_VERSION = 'telegram-registration-v1';
export async function withBotUserLock<T>(db:PrismaClient,userId:string,action:(tx:Prisma.TransactionClient)=>Promise<T>):Promise<T>{
  return db.$transaction(async tx=>{
    const key='BOT_USER_LOCK_'+userId;
    await tx.systemSetting.upsert({where:{key},create:{key,value:{locked:true}},update:{value:{locked:true}}});
    return action(tx);
  });
}
/** Never delete an account whose independent workflow cannot be transferred safely. */
export async function mergeWebRegistration(tx:Prisma.TransactionClient,targetId:string,sourceId:string):Promise<boolean>{
  const [sourceFlow,targetFlow,sourceAssignment,targetAssignment,sourceProfile,targetProfile]=await Promise.all([
    tx.eplanetUserWorkflow.findUnique({where:{userId:sourceId},select:{id:true}}),
    tx.eplanetUserWorkflow.findUnique({where:{userId:targetId},select:{id:true}}),
    tx.userProgressAssignment.findUnique({where:{userId:sourceId},select:{id:true}}),
    tx.userProgressAssignment.findUnique({where:{userId:targetId},select:{id:true}}),
    tx.user.findUnique({where:{id:sourceId},select:{firstName:true,lastName:true,tradingLevel:true,profileCompletedAt:true,registrationSource:true}}),
    tx.user.findUnique({where:{id:targetId},select:{firstName:true,lastName:true,tradingLevel:true,profileCompletedAt:true}})
  ]);
  if(!sourceProfile||!targetProfile)throw Error('account_merge_record_missing');
  const profileConflict=sourceProfile.profileCompletedAt&&targetProfile.profileCompletedAt&&['firstName','lastName','tradingLevel'].some(key=>sourceProfile[key as 'firstName'|'lastName'|'tradingLevel']!==targetProfile[key as 'firstName'|'lastName'|'tradingLevel']);
  const reason=profileConflict?'both_accounts_have_different_completed_profiles':sourceFlow&&targetFlow?'both_accounts_have_eplanet_workflow':sourceAssignment&&targetAssignment?'both_accounts_have_progress_assignment':null;
  if(reason){await tx.auditLog.create({data:{userId:targetId,action:'WEB_PREREGISTRATION_MERGE_SKIPPED',entityType:'User',entityId:sourceId,metadata:{reason}}});return false;}
  if(sourceProfile.profileCompletedAt&&!targetProfile.profileCompletedAt)await tx.user.update({where:{id:targetId},data:{firstName:sourceProfile.firstName,lastName:sourceProfile.lastName,tradingLevel:sourceProfile.tradingLevel,profileCompletedAt:sourceProfile.profileCompletedAt}});
  if(sourceFlow)await tx.eplanetUserWorkflow.update({where:{id:sourceFlow.id},data:{userId:targetId}});
  if(sourceAssignment)await tx.userProgressAssignment.update({where:{id:sourceAssignment.id},data:{userId:targetId}});
  const own=new Map((await tx.lessonProgress.findMany({where:{userId:targetId}})).map(x=>[x.lessonId,x]));
  for(const lesson of await tx.lessonProgress.findMany({where:{userId:sourceId}})){
    const current=own.get(lesson.lessonId);
    if(!current){await tx.lessonProgress.update({where:{id:lesson.id},data:{userId:targetId}});continue;}
    await tx.lessonProgress.update({where:{id:current.id},data:{
      completedAt:current.completedAt||lesson.completedAt,
      progressPct:Math.max(current.progressPct,lesson.progressPct),
      videoProgressPct:Math.max(current.videoProgressPct,lesson.videoProgressPct),
      contentProgressPct:Math.max(current.contentProgressPct,lesson.contentProgressPct)
    }});
  }
  await tx.academyQuizAttempt.updateMany({where:{userId:sourceId},data:{userId:targetId}});
  await tx.userProgressEvent.updateMany({where:{userId:sourceId},data:{userId:targetId}});
  await tx.userConsent.updateMany({where:{userId:sourceId},data:{userId:targetId}});
  await tx.registrationStageEvent.updateMany({where:{userId:sourceId},data:{userId:targetId}});
  await tx.auditLog.updateMany({where:{userId:sourceId},data:{userId:targetId}});
  await tx.supportTicket.updateMany({where:{userId:sourceId},data:{userId:targetId}});
  await tx.notification.updateMany({where:{userId:sourceId},data:{userId:targetId}});
  await tx.followUpJob.updateMany({where:{userId:sourceId},data:{userId:targetId}});
  await tx.user.delete({where:{id:sourceId}});
  await tx.auditLog.create({data:{userId:targetId,action:'WEB_PREREGISTRATION_MERGED',entityType:'User',entityId:sourceId,metadata:{sourceRegistrationSource:sourceProfile.registrationSource}}});
  return true;
}
