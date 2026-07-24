head	1.4;
access;
symbols
	Version_0_6:1.4
	ver032:1.1;
locks; strict;
comment	@ * @;


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
                          WorkOrder.h
                             -------------------
    begin                : Thu Nov 19 2003
    copyright            : (C) 2003 by Alex Dribin
    email                : Alex.Dribin@@gmail.com
 ***************************************************************************/
#ifndef WORK_ORDER_H
#define WORK_ORDER_H

#include "OrderPrototype.h"

/**
  *@@author Alex Dribin
  */
class ReportPattern;
class AbstractData;

class WorkOrder : public OrderPrototype  {
public:
	WorkOrder();
	~WorkOrder(){}
  STATUS loadParameters(Parser * parser, ParameterList &parameters, Entity * entity );
  ORDER_STATUS process (Entity * entity, ParameterList &parameters);
    protected:
};

#endif
@


1.3
log
@Version 0.3.4 (Unfinished)
Includes combat engine
@
text
@d1 28
a28 28
/***************************************************************************
                          WorkOrder.h
                             -------------------
    begin                : Thu Nov 19 2003
    copyright            : (C) 2003 by Alex Dribin
    email                : alexliza@@netvision.net.il
 ***************************************************************************/
#ifndef WORK_ORDER_H
#define WORK_ORDER_H

#include "OrderPrototype.h"

/**
  *@@author Alex Dribin
  */
class ReportPattern;
class AbstractData;

class WorkOrder : public OrderPrototype  {
public:
	WorkOrder();
	~WorkOrder(){}
  STATUS loadParameters(Parser * parser, ParameterList &parameters, Entity * entity );
  ORDER_STATUS process (Entity * entity, ParameterList &parameters);
    protected:
};

#endif
@


1.2
log
@no message
@
text
@d23 2
a24 2
  STATUS loadParameters(Parser * parser, vector <AbstractData *>  &parameters, Entity * entity );
  ORDER_STATUS process (Entity * entity, vector <AbstractData *>  &parameters);
@


1.1
log
@version 0.30
@
text
@d2 1
a2 1
                          WorkOrder.h 
d16 1
a16 1
class Reporter;
d20 1
a20 1
public: 
@

