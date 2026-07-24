head	1.9;
access;
symbols
	Version_0_6:1.7
	ver032:1.3;
locks; strict;
comment	@// @;


1.9
date	2012.06.03.14.12.14;	author asakrana;	state Exp;
branches;
next	1.8;

1.8
date	2010.02.24.09.33.49;	author asakrana;	state Exp;
branches;
next	1.7;

1.7
date	2009.05.29.17.09.35;	author asakrana;	state Exp;
branches;
next	1.6;

1.6
date	2006.01.29.17.31.31;	author asakrana;	state Exp;
branches;
next	1.5;

1.5
date	2004.05.28.04.41.57;	author asakrana;	state Exp;
branches;
next	1.4;

1.4
date	2004.05.27.13.12.06;	author asakrana;	state Exp;
branches;
next	1.3;

1.3
date	2004.05.14.17.01.05;	author asakrana;	state Exp;
branches;
next	1.2;

1.2
date	2004.01.08.11.32.04;	author asakrana;	state Exp;
branches;
next	1.1;

1.1
date	2003.08.13.08.38.59;	author asakrana;	state Exp;
branches;
next	;


desc
@@


1.9
log
@*** empty log message ***
@
text
@/***************************************************************************
                          StudyOrder.cpp
                             -------------------
    begin                : Thu Feb 13 2003
    copyright            : (C) 2003 by Alex Dribin
    email                : Alex.Dribin@@gmail.com
 ***************************************************************************/

#include "StudyOrder.h"
#include "IntegerData.h"
#include "SkillLevelElement.h"
#include "BasicLearningStrategy.h"
#include "SkillRule.h"
#include "RaceRule.h"
#include "Entity.h"
#include "UnitEntity.h"
#include "LocationEntity.h"
#include "FactionEntity.h"
#include "UnaryMessage.h"
#include "BinaryMessage.h"
#include "TertiaryMessage.h"
#include "TeachingOffer.h"
#include "conflicts/TeachingOffer.h"

extern ReportPattern * cannotStudyReporter;
extern ReportPattern * raceErrorReporter;
extern ReportPattern * requirementErrorReporter;
extern ReportPattern * teachingErrorReporter;
extern ReportPattern * maxLevelErrorReporter;
extern ReportPattern * paymentErrorReporter;
extern ReportPattern * learningStartedReporter;
extern ReportPattern * followerSkillLimitReporter ;
extern ReportPattern * elementalSkillLimitReporter ;
extern ReportPattern * itemRequiredReporter;
//StudyOrder instantiateStudyOrder;
StudyOrder * instantiateStudyOrder = new StudyOrder();
const UINT StudyOrder::TEACHER_REQUIRED_REPORT_FLAG = 0x01;

StudyOrder::StudyOrder()
{
   keyword_ = "study";
  registerOrder_();
  description = string("STUDY <skill tag> [level] \n") +
  "Full-day.  This order executes as soon as the requirement in other skills\n" +
  "are fulfilled, if any.  The order fails if the unit cannot learn the skill\n"  +
  "at all.  Creatures cannot use this order.  The unit adds one day of study of\n" +
  "the skill to its experience, spending the indicated amount of coins per\n"  +
  "figure.  If a skill level is indicated, and no duration specified for the\n" +
  "order, the order will reschedule itself automatically.\n\n" +

  "Bonuses to study may occur, see the section on skills for more.\n" +
  "If the faction knows the skill, but the unit lacks a required skill level,\n" +
  "the STUDY will first attempt to study the intermediate skills if this is\n" +
  "possible.  Teaching of intermediate skills will not be allowed; the study\n"  +
  "must be explicit for the teacher to notice.\n\n" +

  "The order will complete as soon as the unit can no longer study the skill, or\n" +
  "as soon as the skill level indicated is reached, whichever comes first.\n";

    fullDayOrder_= true;
  orderType_   = DAY_LONG_ORDER;
  teacherRequired_ = false;
}



STATUS StudyOrder::loadParameters(Parser * parser,
                            ParameterList &parameters, Entity * entity )
{
   if(!entityIsUnit(entity))
            return IO_ERROR;

    if(!parseGameDataParameter(entity,  parser, gameFacade->skills, "skill tag", parameters))
            return IO_ERROR;

    parseIntegerParameter(parser, parameters);

  return OK;


}



ORDER_STATUS StudyOrder::process (Entity * entity, ParameterList &parameters)
{
  UnitEntity * unit = dynamic_cast<UnitEntity *>(entity);
  assert(unit);

  SkillRule * skill = dynamic_cast<SkillRule *>(parameters[0]);
  OrderLine * orderId = entity->getCurrentOrder();
   if ( skill == 0)
    {
	    UnaryMessage * currentMessage = new UnaryMessage(cannotStudyReporter, unit->getRace());
		  unit->addReport(currentMessage,orderId,0 );
 		return INVALID;
    }
 //    if(skill == skills["sboa"])
 //   {
 //      cout <<"sboa!"<<endl;
 //    }
   int level;
   if(parameters.size() > 1)
      {
        IntegerData * par1       =  dynamic_cast<IntegerData *>(parameters[1]);
          assert(par1);
        level  =  par1->getValue();
        if (level > skill->getMaxLevel())
              level = skill->getMaxLevel();
      }
    else
	{
		level = unit->getSkillLevel(skill) +1;
		if(level > skill->getMaxLevel())
			level = skill->getMaxLevel();
	}
   if(unit->isTraced())
   {
       cout<< unit->print()<<" studies "<<skill->print()<<endl;
   }

 TeachingOffer * teacher;
 PROCESSING_STATE  state = unit->getCurrentOrder()->getProcessingState();
 ORDER_STATUS result;

  switch(state)
   {
     case NORMAL_STATE:
     // check if order may be executed
     result = preProcess_(unit,skill,level);
      if( (result == INVALID) ||( result == FAILURE))
      {
        unit->clearTeachingOffers();
        return result;
      }
      teacher = unit->findTeachingOffer(skill,level);

      if(teacher)
          {
            teacher->confirmTeachingOffer(unit);
            unit->getCurrentOrder()->setProcessingState (RESUME);
            unit->getLocation()->setStudentCounter(true);
            return SUSPENDED;
          }

      unit->getCurrentOrder()->setProcessingState (SUSPEND);
      unit->getLocation()->setStudentCounter(true);
      return SUSPENDED;
      break;

     case SUSPEND:
        teacher = unit->findTeachingOffer(skill,level);
        if(teacher)
          {
            teacher->confirmTeachingOffer(unit);
            unit->getCurrentOrder()->setProcessingState (RESUME);
            return SUSPENDED;
          }
         if(unit->getLocation()->getTeacherCounter() )
         {
            return SUSPENDED; // wait. There are other orders suspended and their
                              // results may have effect on this order execution
         }
         // No teacher available If skill requires teacher it fails
         if(teacherRequired_)
         {
            unit->getCurrentOrder()->setProcessingState (NORMAL_STATE);
            unit->clearTeachingOffers();
            unit->getLocation()->setStudentCounter(false);
            // Report absence of teacher
            return FAILURE;
         }
            unit->getCurrentOrder()->setProcessingState (RESUME);
            return SUSPENDED;
        break;

     case RESUME:
        teacher = unit->findTeachingOffer(skill,level);
        unit->getLocation()->setStudentCounter(false);
        unit->getCurrentOrder()->setProcessingState (NORMAL_STATE);
        unit->clearTeachingOffers();
        return doProcess_(unit,skill,level,teacher);
        break;

     default:
      cout << "Unknown state "<< state <<" in STUDY order\n";
   }
 		  return INVALID;
}


/** Checks if study order may be processed (except teaching condition)*/
ORDER_STATUS StudyOrder::preProcess_(UnitEntity * unit, SkillRule * skill, int level)
{
// if(unit->isTraced())
// {
//   cout<<"."<<endl;
// }
 LEARNING_RESULT result = skill->mayBeStudied(unit);
 teacherRequired_ = false;
  OrderLine * orderId = unit->getCurrentOrder();

 switch (result)
  {
    case LEARNING_OK:
    {
      break;
    }
    case TEACHING_REQUIRED:
    {
      teacherRequired_ = true;
      break;
    }
    case CANNOT_STUDY_FAILURE:
    {
	    UnaryMessage * cannotStudyMessage = new UnaryMessage(cannotStudyReporter, unit->getRace());
	 	  unit->addReport(cannotStudyMessage,orderId,0);
 		  return INVALID;
      break;
    }
    case RACE_FAILURE:
    {
		  unit->addReport( new BinaryMessage(raceErrorReporter, unit->getRace(),skill),orderId,0);
 		  return INVALID;
      break;
    }
    case ITEM_REQUIRED_FAILURE:
    {
		  unit->addReport( new BinaryMessage(itemRequiredReporter,
                            skill->getItemRequired(unit)->getItemType() ,skill),orderId,0);
 		  return FAILURE;
      break;
    }
    case REQUIREMENT_FAILURE:
    {
		  unit->addReport(new BinaryMessage(requirementErrorReporter, unit, skill),orderId,0);
 		  return FAILURE;
      break;
    }
    case SKILL_STUDY_LIMIT_FAILURE:
    case MAX_LEVEL_FAILURE:
    {
		  unit->addReport(new BinaryMessage(maxLevelErrorReporter, unit, skill),orderId,0 );
 		  return INVALID;
      break;
    }
    case FOLLOWER_CANNOT_STUDY_SECOND_BASIC_SKILL_FAILURE:
    {
		  unit->addReport(new UnaryMessage(followerSkillLimitReporter, unit),orderId,0 );
 		  return INVALID;
      break;
    }
    case ELEMENTAL_SKILL_LIMIT_FAILURE:
    {
		  unit->addReport(new UnaryMessage(elementalSkillLimitReporter, unit),orderId,0 );
 		  return INVALID;
      break;
    }
    default:
    {
      cerr << "Unexpected result ("<< result<<") of "<< skill->print() <<" learning for " << unit->printTag() <<endl;
 		  return FAILURE;
    }
  }
    // level limit, specified in the order reached
      if(unit->getSkillLevel(skill) >= level )
        {
//         cout << " Order Level is " << level_ << " exp is " << skill_->getLevelExperience()<<" unit's level is "<< unit_->getSkillLevel(skill_)<<endl;
	       BinaryMessage * maxLevelErrorMessage = new BinaryMessage(maxLevelErrorReporter, unit, skill);
		     unit->addReport(maxLevelErrorMessage,orderId,0 );
 		     return INVALID;
        }

   // money check
    int cost = skill->getStudyCost(unit) * unit->getFiguresNumber();
    if (!unit->mayPay(cost) )
     {
	    BinaryMessage * paymentErrorMessage = new BinaryMessage(paymentErrorReporter, unit, skill);
		  unit->addReport(paymentErrorMessage,orderId,0 );
 		  return FAILURE;
    }
 		  return SUSPENDED;

}


/** Checks teaching condition and processes STUDY if possible*/
ORDER_STATUS StudyOrder::doProcess_(UnitEntity * unit, SkillRule * skill, int level, TeachingOffer * teacher)
{
    // Check teacher
    OrderLine * orderId = unit->getCurrentOrder();
    bool needsTeacher = skill->teacherRequired(unit);
    if( needsTeacher && (teacher == 0))
    {
     if(!unit->getCurrentOrder()->getReportingFlag( TEACHER_REQUIRED_REPORT_FLAG))
      {
		    unit->addReport(new BinaryMessage(teachingErrorReporter, unit, skill),orderId,0 );
        unit->getCurrentOrder()->setReportingFlag( TEACHER_REQUIRED_REPORT_FLAG);
      }
     return FAILURE;
    }
    unit->getCurrentOrder()->clearReportingFlag(TEACHER_REQUIRED_REPORT_FLAG);

    int cost = skill->getStudyCost(unit) * unit->getFiguresNumber();
    if(unit->isTraced())
    {
        cout << unit->print()<<" pays "<<cost<< " for study ("<< skill->getStudyCost(unit)<<" and " << unit->getFiguresNumber()<<")"<<endl;
    }
    unit->pay(cost);

   // if this order is not the order that was processed last day we may refrain from reporting
   if(unit->getLastOrder() != unit->getCurrentOrder())
     {
//QQQ
     unit->addReport(new  BinaryMessage(learningStartedReporter,unit,
                        new SkillLevelElement
                        (skill,unit->getSkillLevel(skill) +1)),orderId,0);
    }

  int newExp = skill->calculateLearningExperience(unit, teacher); // Learn-specific
  skill->addLearningExperience(unit,newExp); // Recursive, Learn-specific


   int newLevel = unit->getSkillLevel(skill);

   // Is it level specified in the order?
       if ( newLevel >= level )
 		      return SUCCESS;

 		  return IN_PROGRESS;


}
@


1.8
log
@*** empty log message ***
@
text
@a24 1
extern RulesCollection <SkillRule>     skills;
d73 1
a73 1
    if(!parseGameDataParameter(entity,  parser, skills, "skill tag", parameters))
@


1.7
log
@Version 0.6
@
text
@d23 1
d99 4
a102 4
     if(skill == skills["sboa"])
     {
       cout <<"sboa!"<<endl;
     }
d118 4
a121 1

d306 4
@


1.6
log
@Version 0.3.4 (Unfinished)
Includes combat engine
@
text
@d6 1
a6 1
    email                : alexliza@@netvision.net.il
d33 1
d98 4
a101 1

d112 5
a116 1
      level = skill->getMaxLevel();
d192 4
a195 1

d250 6
d258 1
a258 1
      cout << "Unexpected result ("<< result<<") of "<< skill->print() <<" learning for " << unit->printTag() <<endl;
@


1.5
log
@no message
@
text
@d59 1
d67 1
a67 1
                            vector <AbstractData *>  &parameters, Entity * entity )
d84 1
a84 1
ORDER_STATUS StudyOrder::process (Entity * entity, vector <AbstractData *>  &parameters)
@


1.4
log
@*** empty log message ***
@
text
@d2 1
a2 1
                          StudyOrder.cpp 
d19 3
a21 3
#include "UnaryPattern.h"
#include "BinaryPattern.h"
#include "TertiaryPattern.h"
d25 9
a33 9
extern Reporter * cannotStudyReporter;
extern Reporter * raceErrorReporter;
extern Reporter * requirementErrorReporter;
extern Reporter * teachingErrorReporter;
extern Reporter * maxLevelErrorReporter;
extern Reporter * paymentErrorReporter;
extern Reporter * learningStartedReporter;
extern Reporter * followerSkillLimitReporter ;
extern Reporter * itemRequiredReporter;
d77 1
a77 1
     
d92 1
a92 1
	    UnaryPattern * currentMessage = new UnaryPattern(cannotStudyReporter, unit->getRace());
d129 1
a129 1
            unit->getCurrentOrder()->setProcessingState (RESUME); 
d133 1
a133 1
          
d149 1
a149 1
            return SUSPENDED; // wait. There are other orders suspended and their 
d176 2
a177 2
 		  return INVALID; 		     
}      
d201 1
a201 1
	    UnaryPattern * cannotStudyMessage = new UnaryPattern(cannotStudyReporter, unit->getRace());
d208 1
a208 1
		  unit->addReport( new BinaryPattern(raceErrorReporter, unit->getRace(),skill),orderId,0);
d214 1
a214 1
		  unit->addReport( new BinaryPattern(itemRequiredReporter,
d221 1
a221 1
		  unit->addReport(new BinaryPattern(requirementErrorReporter, unit, skill),orderId,0);
d228 1
a228 1
		  unit->addReport(new BinaryPattern(maxLevelErrorReporter, unit, skill),orderId,0 );
d234 1
a234 1
		  unit->addReport(new UnaryPattern(followerSkillLimitReporter, unit),orderId,0 );
d248 1
a248 1
	       BinaryPattern * maxLevelErrorMessage = new BinaryPattern(maxLevelErrorReporter, unit, skill);
d257 1
a257 1
	    BinaryPattern * paymentErrorMessage = new BinaryPattern(paymentErrorReporter, unit, skill);
d276 1
a276 1
		    unit->addReport(new BinaryPattern(teachingErrorReporter, unit, skill),orderId,0 );
d285 1
a285 1
    
d290 1
a290 1
     unit->addReport(new  BinaryPattern(learningStartedReporter,unit,
@


1.3
log
@ver 0.32
@
text
@d89 1
a89 1

d92 2
a93 2
	    ReportRecord * currentReport = new   ReportRecord(new UnaryPattern(cannotStudyReporter, unit->getRace()));
		  unit->addReport( currentReport);
d186 1
d201 2
a202 3
	    UnaryPattern * Message = new UnaryPattern(cannotStudyReporter, unit->getRace());
	    ReportRecord * currentReport = new   ReportRecord(Message, unit->getCurrentOrder());
		  unit->addReport( currentReport);
d208 1
a208 1
		  unit->addReport( new   ReportRecord(new BinaryPattern(raceErrorReporter, unit->getRace(),skill)));
d214 2
a215 2
		  unit->addReport( new   ReportRecord(new BinaryPattern(itemRequiredReporter,
                            skill->getItemRequired(unit)->getItemType() ,skill)));
d221 1
a221 1
		  unit->addReport(new   ReportRecord(new BinaryPattern(requirementErrorReporter, unit, skill)) );
d228 1
a228 1
		  unit->addReport(new   ReportRecord(new BinaryPattern(maxLevelErrorReporter, unit, skill)) );
d234 1
a234 1
		  unit->addReport(new   ReportRecord(new UnaryPattern(followerSkillLimitReporter, unit)) );
d248 2
a249 3
	       BinaryPattern * Message = new BinaryPattern(maxLevelErrorReporter, unit, skill);
	       ReportRecord * currentReport = new   ReportRecord(Message, unit->getCurrentOrder());
		     unit->addReport( currentReport);
d257 2
a258 3
	    BinaryPattern * Message = new BinaryPattern(paymentErrorReporter, unit, skill);
	    ReportRecord * currentReport = new   ReportRecord(Message, unit->getCurrentOrder());
		  unit->addReport( currentReport);
d270 1
d276 1
a276 1
		    unit->addReport(new   ReportRecord(new BinaryPattern(teachingErrorReporter, unit, skill)) );
d292 1
a292 1
                        (skill,unit->getSkillLevel(skill) +1)));
@


1.2
log
@version 0.30
@
text
@d240 1
a240 1
      cout << "Unexpected result ("<< result<<") of "<< skill->printName() <<" learning for " << unit->printTag() <<endl;
@


1.1
log
@Version 0.23
@
text
@d11 1
a11 1
#include "SkillLevelElementData.h"
d33 4
d41 1
d60 1
d62 3
d82 2
a83 1
ORDER_STATUS StudyOrder::process (Entity * entity, vector <AbstractData *>  &parameters, Order * orderId)
d111 1
a111 1
 PROCESSING_STATE  state = orderId->getProcessingState();
d118 1
a118 1
     result = preProcess_(unit,skill,level,orderId);
d129 1
a129 1
            orderId->setProcessingState (RESUME); 
d134 1
a134 1
      orderId->setProcessingState (SUSPEND);
d144 1
a144 1
            orderId->setProcessingState (RESUME);
d152 10
a161 1
            orderId->setProcessingState (RESUME);
d168 1
a168 1
        orderId->setProcessingState (NORMAL_STATE);
d170 1
a170 1
        return doProcess_(unit,skill,level,teacher,orderId);
d181 1
a181 1
ORDER_STATUS StudyOrder::preProcess_(UnitEntity * unit, SkillRule * skill, int level, Order * orderId)
d184 2
a185 1
 LEARNING_RESULT result = skill->mayStudy(unit);
d193 5
d201 1
a201 1
	    ReportRecord * currentReport = new   ReportRecord(Message, orderId);
d212 7
d225 1
a225 1
    case FOLLOWER_CANNOT_STUDY_LEVEL_FAILURE:
d249 1
a249 1
	       ReportRecord * currentReport = new   ReportRecord(Message, orderId);
d256 1
a256 1
    if (!unit->pay(cost) )
d259 1
a259 1
	    ReportRecord * currentReport = new   ReportRecord(Message, orderId);
d269 1
a269 1
ORDER_STATUS StudyOrder::doProcess_(UnitEntity * unit, SkillRule * skill, int level, TeachingOffer * teacher, Order * orderId)
d275 6
a280 2
		  unit->addReport(new   ReportRecord(new BinaryPattern(teachingErrorReporter, unit, skill)) );
 		  return FAILURE;
d282 1
d284 3
d288 1
a288 1
   if(unit->getLastOrder() != orderId)
d290 1
d292 2
a293 2
                        new SkillLevelElementData(new SkillLevelElement
                        (skill,unit->getSkillLevel(skill) +1))));
@

