head	1.5;
access;
symbols
	Version_0_6:1.5
	ver032:1.3;
locks; strict;
comment	@ * @;


1.5
date	2009.05.29.17.09.35;	author asakrana;	state Exp;
branches;
next	1.4;

1.4
date	2006.01.29.17.31.31;	author asakrana;	state Exp;
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


1.5
log
@Version 0.6
@
text
@/***************************************************************************
                          MoveOrder.h
                             -------------------
    begin                : Mon Apr 7 2003
    copyright            : (C) 2003 by Alex Dribin
    email                : Alex.Dribin@@gmail.com
 ***************************************************************************/
#ifndef MOVE_ORDER_H
#define MOVE_ORDER_H
#include "OrderPrototype.h"
class TokenEntity;

/**
  *@@author Alex Dribin
  */

class MoveOrder : public OrderPrototype  {
public:
	MoveOrder();
	~MoveOrder(){}
  STATUS loadParameters(Parser * parser, ParameterList &parameters, Entity * entity );
  ORDER_STATUS process (Entity * entity, ParameterList &parameters);
   static ORDER_STATUS move(TokenEntity * tokenEntity, AbstractData * parameter, bool marchMode);
    protected:
static const  UINT OVERLOADING_REPORT_FLAG;
static const  UINT NO_MOVEMENT_ABILITY_REPORT_FLAG;
};

#endif
@


1.4
log
@Version 0.3.4 (Unfinished)
Includes combat engine
@
text
@d6 1
a6 1
    email                : alexliza@@netvision.net.il
@


1.3
log
@ver 0.32
@
text
@d2 1
a2 1
                          MoveOrder.h 
d18 1
a18 1
public: 
d21 3
a23 3
  STATUS loadParameters(Parser * parser, vector <AbstractData *>  &parameters, Entity * entity );
  ORDER_STATUS process (Entity * entity, vector <AbstractData *>  &parameters);
  static ORDER_STATUS move(TokenEntity * tokenEntity, AbstractData * parameter);
@


1.2
log
@version 0.30
@
text
@d11 1
a11 1
class PhysicalEntity;
d23 1
a23 1
  static ORDER_STATUS move(PhysicalEntity * tokenEntity, AbstractData * parameter);
@


1.1
log
@Version 0.23
@
text
@d11 1
d22 2
a23 1
  ORDER_STATUS process (Entity * entity, vector <AbstractData *>  &parameters, Order * orderId);
@

