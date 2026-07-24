head	1.8;
access;
symbols
	Version_0_6:1.6
	ver032:1.3;
locks; strict;
comment	@// @;


1.8
date	2012.06.03.14.12.14;	author asakrana;	state Exp;
branches;
next	1.7;

1.7
date	2010.02.24.09.33.49;	author asakrana;	state Exp;
branches;
next	1.6;

1.6
date	2009.05.29.17.09.35;	author asakrana;	state Exp;
branches;
next	1.5;

1.5
date	2006.01.29.17.31.31;	author asakrana;	state Exp;
branches;
next	1.4;

1.4
date	2004.05.28.04.41.56;	author asakrana;	state Exp;
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


1.8
log
@*** empty log message ***
@
text
@/***************************************************************************
                          MoveOrder.cpp
                             -------------------
    begin                : Mon Apr 7 2003
    copyright            : (C) 2003 by Alex Dribin
    email                : Alex.Dribin@@gmail.com
 ***************************************************************************/
#include "MoveOrder.h"
#include "GameFacade.h"
#include "StringData.h"
#include "IntegerData.h"
#include "Entity.h"
#include "UnitEntity.h"
#include "LocationEntity.h"
#include "RaceRule.h"
#include "DirectionVariety.h"
#include "UnaryMessage.h"
#include "BinaryMessage.h"
#include "EntitiesCollection.h"
#include "RulesCollection.h"
#include "TravelElement.h"
#include "BasicExit.h"
#include "QuartenaryMessage.h"

const UINT MoveOrder::OVERLOADING_REPORT_FLAG = 0x01;
const UINT MoveOrder::NO_MOVEMENT_ABILITY_REPORT_FLAG = 0x02;
extern ReportPattern *	invalidParameterReporter;
extern ReportPattern *	missingParameterReporter;
extern ReportPattern * cantMoveReporter;
extern ReportPattern * overloadReporter;
extern ReportPattern * noMovementAbilityReporter;
extern ReportPattern *	invaliDirectionReporter;
//extern const int VERY_BIG_NUMBER;

//MoveOrder instantiateMoveOrder;
MoveOrder * instantiateMoveOrder = new MoveOrder();

MoveOrder::MoveOrder(){

  keyword_ = "move";
  registerOrder_();
  description = string("MOVE direction|location-id \n") +
  "Full-day, leader/creature-only, one-shot.  This order executes if you are in\n" +
  "a location from which the specified direction is available, or from which the\n" +
  "location specified by its ID is accessible.  If the unit was stacked, the unit\n" +
  "begins by unstacking.  The stack then begins to move toward the location.  The\n" +
  "order is finished when the movement is finished, a RETREAT is given to cancel\n" +
  "the movement, or the access to the location is prevented by a unit on PATROL.\n" +
  "\n" +
  "If the movement is prefixed by the infinite repeat request symbol ('@@'), it\n" +
  "is retained after execution. Specific duration is ignored.\n";

    fullDayOrder_= true;
  orderType_   = STACK_ORDER;
}



STATUS MoveOrder::loadParameters(Parser * parser,
                            ParameterList &parameters, Entity * entity )
{
	 if(!entityIsTokenEntity(entity))
            return IO_ERROR;

   const string tag = parser->getWord();

   if (tag.size() == 0)  // Missing parameter
        {
        entity->addReport(new BinaryMessage( missingParameterReporter, new StringData( keyword_), new StringData("destination ")));
         return IO_ERROR;
        }

   LocationEntity * destination = gameFacade->locations[tag];
   if( destination != 0)
          {
   		      parameters.push_back(destination);
            return OK;
          }
   DirectionVariety *direction = gameFacade->directions[tag];
   if( direction != 0)
          {
   		      parameters.push_back(direction);
            return OK;
          }
    else
				{
          StringData * dummy = new StringData(tag);
   		     parameters.push_back(dummy);
				}

    return OK;
}



// Currently MOVE supports only one parameter.
// Later parameter list like MOVE L123 N NE SE should be supported.
// take parsing from Caravan, execute one-by one, delete executed locations
// from parameters list. return IN-PROGRESS and SUCCESS only if the end of
// parameters list reached
ORDER_STATUS MoveOrder::process (Entity * entity, ParameterList &parameters)
{

  TokenEntity * tokenEntity = dynamic_cast<TokenEntity *>(entity);
  assert(tokenEntity);
  return move(tokenEntity,parameters[0], false);
}




ORDER_STATUS MoveOrder::move(TokenEntity * tokenEntity, AbstractData *parameter, 																bool marchMode)
{
  OrderLine * orderId = tokenEntity->getCurrentOrder();

  LocationEntity * location = tokenEntity->getGlobalLocation();

  if (location == 0)
     {  // Unit is already moving may be special message?
 		  return INVALID;
      }

  BasicExit * exit = 0;
  string parValue = parameter->print();
	LocationEntity * destination   =  dynamic_cast<LocationEntity *>(parameter);
  if( destination != 0)
    {
      exit = location->findExit(destination);
      parValue  = destination->getTag();
    }
  else
    {
  // directions are relative to current positions
  // That's why they can't be calculated on loading
      DirectionVariety * direction =   dynamic_cast< DirectionVariety*>(parameter);
      if( direction != 0)
        {
          exit = location->findExit(direction);
          parValue  = direction->getTag();
        }
    }
  if (exit == 0)
     {  // direction is wrong or location not connected
      tokenEntity->addReport(new UnaryMessage(invaliDirectionReporter, new StringData(parValue)));
 		  return INVALID;
      }

//=================
   if(!tokenEntity->mayMove())
   {
      tokenEntity->addReport(new BinaryMessage(cantMoveReporter,tokenEntity,tokenEntity->getType()) );
 		  return INVALID;
   }
// 	if (tokenEntity->isTraced())
//     cout <<"== TRACING " <<tokenEntity->print()<< " ==> Attempts to move\n";

  tokenEntity->leaveStaying();

 int weight=0;
 int time = 0;
 int totalTravelTime = VERY_BIG_NUMBER;
 MovementVariety * movingMode = 0;
 MovementMode<int> capacity;
 tokenEntity->calculateTotalWeight(weight);
 int i;
 int bestCapacity = 0;
 MovementVariety * bestMode = 0;
 MovementVariety * currentMode = 0;

 for(i = 0; i < gameFacade->movementModes.size(); i++)
  {
	 currentMode = gameFacade->movementModes[i];
 	if(tokenEntity->isTraced())
 	{
 		cout <<"== TRACING ++++> MOVING: "<<" "<< currentMode->print();
                cout<<"Exit time " << exit->getTravelTime(currentMode)<<endl;
 	}   tokenEntity->calculateTotalCapacity(capacity[i], i);
	 time = tokenEntity->calculateTravelTime(exit->getTravelTime(currentMode),
	  currentMode);
 	if(tokenEntity->isTraced())
 	{
 		cout <<"== TRACING ++++> MOVING: "<< tokenEntity->print() <<" "<< currentMode->print()<<" capacity "<< capacity[i]<<" time " << time<<endl;
 	}
   if(time == 0)
    	continue;
   if(capacity[i] > bestCapacity)
    {
        bestCapacity = capacity[i];
        bestMode = currentMode;
    }
   if(weight > capacity[i])
    {
      if(currentMode == walkingMode) // only walking entity may be Overloaded
        time = tokenEntity->calculateOverloading(time , weight, capacity[i]);
      else
        time = 0;
    }
   if(time == 0)
    continue;
 // 5. Conditions (Skill) may be demanded to enter

    if (time < totalTravelTime)
        {
         totalTravelTime = time;
         movingMode = currentMode;
         }
  }

  if(movingMode == 0)
    {
      if (bestMode == 0) // have no ability to move
        {
          if(!orderId->getReportingFlag(NO_MOVEMENT_ABILITY_REPORT_FLAG ))
            {
              tokenEntity->addReport(new BinaryMessage(noMovementAbilityReporter,
                              tokenEntity,exit->getDestination()));
              orderId->setReportingFlag(NO_MOVEMENT_ABILITY_REPORT_FLAG);
            }
  	      return FAILURE;
         }
      else // overload
        {
          orderId->clearReportingFlag(NO_MOVEMENT_ABILITY_REPORT_FLAG);
          if(!orderId->getReportingFlag(OVERLOADING_REPORT_FLAG ))
            {

              tokenEntity->addReport(new QuartenaryMessage(overloadReporter, tokenEntity,
                                    new IntegerData(weight),
                                    new IntegerData(bestCapacity),
                                    new StringData(bestMode->getName())));

              orderId->setReportingFlag(OVERLOADING_REPORT_FLAG);
            }
  	      return FAILURE;
        }
    }
    orderId->clearReportingFlag(OVERLOADING_REPORT_FLAG);
   TravelElement * moving = new TravelElement( movingMode, tokenEntity->getLocation(), exit->getDestination(),
                                totalTravelTime, totalTravelTime,marchMode);
   tokenEntity->setEntityMoving(moving);
	    return SUCCESS;

}


@


1.7
log
@*** empty log message ***
@
text
@d9 1
d24 1
a24 2
extern EntitiesCollection <LocationEntity>      locations;
extern VarietiesCollection  <DirectionVariety>      directions;
d73 1
a73 1
   LocationEntity * destination = locations[tag];
d79 1
a79 1
   DirectionVariety *direction = directions[tag];
d170 1
a170 1
 for(i = 0; i < movementModes.size(); i++)
d172 1
a172 1
	 currentMode = movementModes[i];
@


1.6
log
@Version 0.6
@
text
@d173 5
a177 1
   tokenEntity->calculateTotalCapacity(capacity[i], i);
d180 4
a183 4
// 	if(tokenEntity->isTraced())
// 	{
// 		cout <<"== TRACING ++++> MOVING: "<< tokenEntity->print() <<" "<< currentMode->print()<<" capacity "<< capacity[i]<<" time " << time<<endl;
// 	}
@


1.5
log
@Version 0.3.4 (Unfinished)
Includes combat engine
@
text
@d6 1
a6 1
    email                : alexliza@@netvision.net.il
d33 1
d62 1
a62 1
   if(!entityIsTokenEntity(entity))
d154 2
a155 2
	if (tokenEntity->isTraced())
    cout <<"== TRACING " <<tokenEntity->print()<< " ==> Attempts to move\n";
d157 1
a157 1
 tokenEntity->leaveStaying();
d161 1
a161 1
 int totalTravelTime = 999;
d176 4
a179 1
// cout <<"++++++++ MOVING: "<< tokenEntity->print() <<" "<< currentMode->print()<<" capacity "<< capacity[i]<<" time " << time<<endl;
@


1.4
log
@no message
@
text
@a26 1
extern ReportPattern *	invalidOrderReporter;
d52 1
d59 1
a59 1
                            vector <AbstractData *>  &parameters, Entity * entity )
d68 1
a68 1
        entity->addReport(new BinaryMessage(missingParameterReporter, new StringData(keyword_), new StringData("destination ")));
d100 1
a100 1
ORDER_STATUS MoveOrder::process (Entity * entity, vector <AbstractData *>  &parameters)
d105 1
a105 1
  return move(tokenEntity,parameters[0]);
d109 3
a111 1
ORDER_STATUS MoveOrder::move(TokenEntity * tokenEntity, AbstractData *parameter)
d167 1
d171 1
d173 3
a175 2
   time = exit->getTravelTime(movementModes[i]);
// cout <<"++++++++ MOVING: "<< tokenEntity->print() <<" "<< movementModes[i]->print()<<" capacity "<< capacity[i]<<" time " << time<<endl;
d177 2
a178 2
    continue;
    if(capacity[i] > bestCapacity)
d181 1
a181 1
        bestMode = movementModes[i];
d183 1
a183 1
    if(weight > capacity[i])
d185 2
a186 2
      if(movementModes[i] == walkingMode) // only walking entity may be Overloaded
        time = tokenEntity->calculateTravelTime(time , weight, capacity[i]);
d197 1
a197 1
         movingMode = movementModes[i];
d230 2
a231 2
   TravelElement * moving = new TravelElement(movingMode,tokenEntity->getLocation(),exit->getDestination(),
                                totalTravelTime, totalTravelTime);
@


1.3
log
@ver 0.32
@
text
@d2 1
a2 1
                          MoveOrder.cpp 
d16 2
a17 2
#include "UnaryPattern.h"
#include "BinaryPattern.h"
d22 1
a22 1
#include "QuartenaryPattern.h"
d27 7
a33 7
extern Reporter *	invalidOrderReporter;
extern Reporter *	invalidParameterReporter;
extern Reporter *	missingParameterReporter;
extern Reporter * cantMoveReporter;
extern Reporter * overloadReporter;
extern Reporter * noMovementAbilityReporter;
extern Reporter *	invaliDirectionReporter;
d52 1
a52 1
  
d63 1
a63 1
            
d65 1
a65 1
   
d68 1
a68 1
        entity->addReport(new BinaryPattern(missingParameterReporter, new StringData(keyword_), new StringData("destination ")));
d84 1
a84 1
    else      
d98 1
a98 1
// from parameters list. return IN-PROGRESS and SUCCESS only if the end of 
d112 1
a112 1
   
d114 1
a114 1
      
d124 1
a124 1
    { 
d129 1
a129 1
    {  
d141 1
a141 1
      tokenEntity->addReport(new UnaryPattern(invaliDirectionReporter, new StringData(parValue)));
d148 1
a148 1
      tokenEntity->addReport(new BinaryPattern(cantMoveReporter,tokenEntity,tokenEntity->getType()) );
d155 1
a155 1
 
d180 1
a180 1
      if(movementModes[i] == walkingMode) // only walking entity may be Overloaded 
d202 2
a203 2
              tokenEntity->addReport(new BinaryPattern(noMovementAbilityReporter,
                              tokenEntity,exit->getDestination()));     
d207 1
a207 1
         } 
d213 2
a214 2
        
              tokenEntity->addReport(new QuartenaryPattern(overloadReporter, tokenEntity,
d218 1
a218 1
        
@


1.2
log
@version 0.30
@
text
@d61 1
a61 1
   if(!entityIsPhysicalEntity(entity))
d103 1
a103 1
  PhysicalEntity * tokenEntity = dynamic_cast<PhysicalEntity *>(entity);
d109 1
a109 1
ORDER_STATUS MoveOrder::move(PhysicalEntity * tokenEntity, AbstractData *parameter)
d111 1
a111 1
  Order * orderId = tokenEntity->getCurrentOrder();
d121 1
a121 1
  string parValue = parameter->printName();
d152 1
a152 1
    cout <<"== TRACING " <<tokenEntity->printName()<< " ==> Attempts to move\n";
d170 1
a170 1
// cout <<"++++++++ MOVING: "<< tokenEntity->printName() <<" "<< movementModes[i]->printName()<<" capacity "<< capacity[i]<<" time " << time<<endl;
@


1.1
log
@Version 0.23
@
text
@d35 2
d41 1
d56 2
d61 1
a61 1
   if(!entityIsUnit(entity))
d93 8
a100 1
ORDER_STATUS MoveOrder::process (Entity * entity, vector <AbstractData *>  &parameters, Order * orderId)
d103 11
a113 4
  UnitEntity * unit = dynamic_cast<UnitEntity *>(entity);
  assert(unit);
    
  LocationEntity * location = unit->getGlobalLocation();
d121 2
a122 2
  string parValue = parameters[0]->printName();
	LocationEntity * destination   =  dynamic_cast<LocationEntity *>(parameters[0]);
d132 1
a132 1
      DirectionVariety * direction =   dynamic_cast< DirectionVariety*>(parameters[0]);
d141 1
a141 1
      entity->addReport(new UnaryPattern(invaliDirectionReporter, new StringData(parValue)));
d146 1
a146 1
   if(!unit->getRace()->mayMove())
d148 1
a148 2
      // Followers may move with scouting!
      unit->addReport(new BinaryPattern(cantMoveReporter,unit,unit->getRace()) );
d151 2
a152 6
	if (unit->isTraced())
    cout <<"== TRACING " <<unit->printName()<< " ==> Attempts to move\n";

 // Can't move while shopping - obsolete
 unit->stayStack();
 // Can't enter unfinished buildings - obsolete
d154 2
d161 1
a161 1
 unit->calculateStackWeight(weight);
d168 1
a168 1
   unit->calculateStackCapacity(capacity[i], i);
d170 1
a170 1
// cout <<"++++++++ MOVING: "<< unit->printName() <<" "<< movementModes[i]->printName()<<" capacity "<< capacity[i]<<" time " << time<<endl;
d178 7
a184 1
   time = unit->calculateTravelTime(time , weight, capacity[i]);
d202 2
a203 2
              unit->addReport(new BinaryPattern(noMovementAbilityReporter,
                              unit,exit->getDestination()));     
d214 1
a214 1
              unit->addReport(new QuartenaryPattern(overloadReporter, unit,
d225 1
a225 1
   TravelElement * moving = new TravelElement(movingMode,unit->getLocation(),exit->getDestination(),
d227 1
a227 3
   unit->unstack();
   unit->setUnitMoving(moving);
   unit->setStackMoving(moving);
d231 2
@

