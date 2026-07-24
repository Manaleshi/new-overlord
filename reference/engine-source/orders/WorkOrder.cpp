head	1.4;
access;
symbols
	Version_0_6:1.4
	ver032:1.1;
locks; strict;
comment	@// @;


1.4
date	2009.05.29.17.09.35;	author asakrana;	state Exp;
branches;
next	1.3;

1.3
date	2006.01.29.17.31.31;	author asakrana;	state Exp;
branches;
next	1.2;

1.2
date	2004.05.28.04.41.57;	author asakrana;	state Exp;
branches;
next	1.1;

1.1
date	2004.01.08.11.43.50;	author asakrana;	state Exp;
branches;
next	;


desc
@@


1.4
log
@Version 0.6
@
text
@/***************************************************************************
                             WorkOrder.cpp
                             -------------------
    begin                : Thu Nov 19 2003
    copyright            : (C) 2003 by Alex Dribin
    email                : Alex.Dribin@@gmail.com
 ***************************************************************************/
#include "WorkOrder.h"
#include "StringData.h"
#include "Entity.h"
#include "UnitEntity.h"
#include "UnaryMessage.h"
#include "BinaryMessage.h"
#include "TertiaryMessage.h"
#include "EntitiesCollection.h"
extern ReportPattern *	AtReporter;

WorkOrder * instantiateWorkOrder = new WorkOrder();

WorkOrder::WorkOrder(){
  keyword_ = "Work";
  registerOrder_();
  description = string("WORK \n") +
  "Full-day.  Leader/follower only.  Spend the time working for the minimum\n" +
  "wage.  This is the default order.\n";

    fullDayOrder_= true;
  orderType_   = DAY_LONG_ORDER;
}

STATUS WorkOrder::loadParameters(Parser * parser,
                            ParameterList &parameters, Entity * entity )
{
   if(!entityIsUnit(entity))
            return IO_ERROR;

  return OK;

}



ORDER_STATUS WorkOrder::process (Entity * entity, ParameterList &parameters)
{
  UnitEntity * unit = dynamic_cast<UnitEntity *>(entity);
  assert(unit);
  if(unit->work())
  	return SUCCESS;
  else
	return FAILURE;
}

@


1.3
log
@Version 0.3.4 (Unfinished)
Includes combat engine
@
text
@d1 52
a52 52
/***************************************************************************
                             WorkOrder.cpp
                             -------------------
    begin                : Thu Nov 19 2003
    copyright            : (C) 2003 by Alex Dribin
    email                : alexliza@@netvision.net.il
 ***************************************************************************/
#include "WorkOrder.h"
#include "StringData.h"
#include "Entity.h"
#include "UnitEntity.h"
#include "UnaryMessage.h"
#include "BinaryMessage.h"
#include "TertiaryMessage.h"
#include "EntitiesCollection.h"
extern ReportPattern *	AtReporter;

WorkOrder * instantiateWorkOrder = new WorkOrder();

WorkOrder::WorkOrder(){
  keyword_ = "Work";
  registerOrder_();
  description = string("WORK \n") +
  "Full-day.  Leader/follower only.  Spend the time working for the minimum\n" +
  "wage.  This is the default order.\n";

    fullDayOrder_= true;
  orderType_   = DAY_LONG_ORDER;
}

STATUS WorkOrder::loadParameters(Parser * parser,
                            ParameterList &parameters, Entity * entity )
{
   if(!entityIsUnit(entity))
            return IO_ERROR;

  return OK;

}



ORDER_STATUS WorkOrder::process (Entity * entity, ParameterList &parameters)
{
  UnitEntity * unit = dynamic_cast<UnitEntity *>(entity);
  assert(unit);
  if(unit->work())
  	return SUCCESS;
  else
	return FAILURE;
}

@


1.2
log
@no message
@
text
@d26 2
d32 1
a32 1
                            vector <AbstractData *>  &parameters, Entity * entity )
d43 1
a43 1
ORDER_STATUS WorkOrder::process (Entity * entity, vector <AbstractData *>  &parameters)
@


1.1
log
@version 0.30
@
text
@d2 1
a2 1
                             WorkOrder.cpp 
d12 3
a14 3
#include "UnaryPattern.h"
#include "BinaryPattern.h"
#include "TertiaryPattern.h"
d16 1
a16 1
extern Reporter *	AtReporter;
d47 1
a47 1
  else	
@

