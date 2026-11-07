-- =============================================================================
-- seed.sql — development seed
-- Prices in pesewas. "Harbour Kitchen" is a WORKING NAME until the restaurant's
-- real name, logo and prices are supplied; everything here is editable from
-- the admin dashboard.
-- =============================================================================

insert into public.restaurant_settings
  (id, name, tagline, tax_rate_bp, service_charge_bp, opening_hours, kiosk_timeout_seconds,
   accept_cash, accept_mobile_money, accept_card, default_prep_minutes)
values
  (1, 'Harbour Kitchen', 'Good Food. Great Moments.', 0, 0,
   '{"mon":{"open":"08:00","close":"22:00"},"tue":{"open":"08:00","close":"22:00"},
     "wed":{"open":"08:00","close":"22:00"},"thu":{"open":"08:00","close":"22:00"},
     "fri":{"open":"08:00","close":"23:00"},"sat":{"open":"09:00","close":"23:00"},
     "sun":{"open":"11:00","close":"21:00"}}'::jsonb,
   90, true, true, false, 15)
on conflict (id) do nothing;

-- Tables
insert into public.restaurant_tables (number, seats)
select n::text, 4 from generate_series(1, 16) as n
on conflict (number) do nothing;

-- Categories
insert into public.menu_categories (name, slug, sort_order) values
  ('Popular',      'popular',      0),
  ('Rice Meals',   'rice-meals',   1),
  ('Local Dishes', 'local-dishes', 2),
  ('Chicken',      'chicken',      3),
  ('Burgers',      'burgers',      4),
  ('Snacks',       'snacks',       5),
  ('Sides',        'sides',        6),
  ('Drinks',       'drinks',       7),
  ('Desserts',     'desserts',     8)
on conflict (slug) do nothing;

-- Menu items ("Popular" is a virtual category driven by is_popular, so no items are
-- assigned to it directly; the kiosk builds that tab from the flag.)
with c as (select slug, id from public.menu_categories)
insert into public.menu_items (category_id, name, description, base_price, is_popular, is_featured, prep_minutes, sort_order)
select c.id, v.name, v.description, v.price, v.popular, v.featured, v.prep, v.ord
from (values
  -- Rice meals
  ('rice-meals', 'Jollof Rice with Grilled Chicken',  'Smoky tomato jollof served with a quarter grilled chicken, shito and fresh salad.',   7500, true,  true,  15, 0),
  ('rice-meals', 'Fried Rice with Chicken',           'Vegetable fried rice with a quarter fried chicken and salad.',                         7000, true,  false, 15, 1),
  ('rice-meals', 'Assorted Fried Rice',               'Fried rice loaded with chicken, beef and sausage.',                                     9500, false, false, 18, 2),
  ('rice-meals', 'Plain Rice with Chicken Stew',      'Steamed rice with slow-cooked chicken stew.',                                           6000, false, false, 12, 3),
  -- Local dishes
  ('local-dishes', 'Banku with Grilled Tilapia',      'Two balls of banku, whole grilled tilapia, hot pepper, onion and tomato.',             11000, true, true,  25, 0),
  ('local-dishes', 'Waakye Special',                  'Rice and beans with shito, gari, spaghetti, boiled egg and your choice of protein.',     6500, true, false, 10, 1),
  ('local-dishes', 'Fufu with Light Soup',            'Pounded fufu with goat light soup.',                                                      8500, false, false, 20, 2),
  ('local-dishes', 'Kenkey with Fried Fish',          'Ga kenkey, fried fish, shito and pepper sauce.',                                          5500, false, false, 12, 3),
  ('local-dishes', 'Red Red',                         'Bean stew in palm oil with fried ripe plantain.',                                         5000, false, false, 12, 4),
  -- Chicken
  ('chicken', '2 Piece Fried Chicken',                'Two pieces of crispy fried chicken with one side.',                                       6500, true,  false, 12, 0),
  ('chicken', '4 Piece Fried Chicken',                'Four pieces of crispy fried chicken with two sides.',                                    12000, false, false, 15, 1),
  ('chicken', 'Grilled Chicken Half',                 'Half chicken, marinated and grilled, served with fries or plantain.',                    9000, false, true,  20, 2),
  ('chicken', 'Chicken Wings (6)',                    'Six wings tossed in your choice of sauce.',                                               5500, false, false, 15, 3),
  -- Burgers
  ('burgers', 'Classic Beef Burger',                  'Flame-grilled beef patty, cheddar, lettuce, tomato and house sauce.',                     6500, false, false, 12, 0),
  ('burgers', 'Crispy Chicken Burger',                'Crispy fried chicken fillet, coleslaw and spicy mayo.',                                   6000, true,  false, 12, 1),
  ('burgers', 'Double Beef Burger',                   'Two beef patties, double cheese, caramelised onion.',                                     9000, false, false, 15, 2),
  -- Snacks
  ('snacks', 'Meat Pie',                              'Baked pastry filled with seasoned minced beef.',                                          1200, false, false,  3, 0),
  ('snacks', 'Spring Rolls (4)',                      'Crispy vegetable spring rolls with sweet chilli.',                                        2500, false, false,  6, 1),
  ('snacks', 'Kelewele Cup',                          'Spiced fried plantain cubes with roasted peanuts.',                                       2000, true,  false,  6, 2),
  -- Sides
  ('sides', 'French Fries',                           'Golden fries, lightly salted.',                                                           2000, false, false,  6, 0),
  ('sides', 'Fried Plantain',                         'Ripe plantain, fried till caramelised.',                                                  1800, false, false,  6, 1),
  ('sides', 'Coleslaw',                               'Fresh cabbage and carrot in creamy dressing.',                                            1200, false, false,  2, 2),
  ('sides', 'Garden Salad',                           'Lettuce, cucumber, tomato and onion.',                                                    1500, false, false,  3, 3),
  -- Drinks
  ('drinks', 'Sobolo',                                'Chilled hibiscus drink with ginger and pineapple.',                                        1500, true,  false,  1, 0),
  ('drinks', 'Fresh Pineapple Juice',                 'Freshly pressed, served over ice.',                                                        2500, false, false,  2, 1),
  ('drinks', 'Soft Drink',                            'Coca-Cola, Fanta, Sprite or Malta.',                                                      1200, false, false,  1, 2),
  ('drinks', 'Bottled Water',                         '750ml still water.',                                                                       800, false, false,  1, 3),
  -- Desserts
  ('desserts', 'Vanilla Ice Cream',                   'Two scoops with chocolate drizzle.',                                                       2000, false, false,  2, 0),
  ('desserts', 'Chocolate Cake Slice',                'Rich chocolate sponge with ganache.',                                                      2800, false, false,  2, 1)
) as v(slug, name, description, price, popular, featured, prep, ord)
join c on c.slug = v.slug;

-- Customization groups & options
-- Jollof: protein choice (single, required), extras (multiple), drink add-on
with item as (select id from public.menu_items where name = 'Jollof Rice with Grilled Chicken'),
g as (
  insert into public.customization_groups (menu_item_id, name, selection_type, is_required, min_select, max_select, sort_order)
  select id, 'Portion', 'single'::public.selection_type, true, 1, 1, 0 from item
  union all select id, 'Extras', 'multiple'::public.selection_type, false, 0, 4, 1 from item
  union all select id, 'Add a drink', 'single'::public.selection_type, false, 0, 1, 2 from item
  returning id, name
)
insert into public.customization_options (group_id, name, price_delta, is_default, sort_order)
select g.id, o.name, o.delta, o.dflt, o.ord
from g join (values
  ('Portion',     'Regular',            0,    true,  0),
  ('Portion',     'Large',              1500, false, 1),
  ('Extras',      'Extra chicken',      2500, false, 0),
  ('Extras',      'Fried plantain',     1000, false, 1),
  ('Extras',      'Boiled egg',          500, false, 2),
  ('Extras',      'Extra shito',         300, false, 3),
  ('Add a drink', 'Sobolo',             1500, false, 0),
  ('Add a drink', 'Soft drink',         1200, false, 1),
  ('Add a drink', 'Bottled water',       800, false, 2)
) as o(grp, name, delta, dflt, ord) on o.grp = g.name;

-- Waakye: protein (single, required)
with item as (select id from public.menu_items where name = 'Waakye Special'),
g as (
  insert into public.customization_groups (menu_item_id, name, selection_type, is_required, min_select, max_select, sort_order)
  select id, 'Protein', 'single'::public.selection_type, true, 1, 1, 0 from item
  returning id
)
insert into public.customization_options (group_id, name, price_delta, is_default, sort_order)
select g.id, o.name, o.delta, o.dflt, o.ord from g join (values
  ('Fried fish',      0,    true,  0),
  ('Fried chicken',   1000, false, 1),
  ('Beef',            1500, false, 2),
  ('Wele (cow skin)',  800, false, 3)
) as o(name, delta, dflt, ord) on true;

-- Chicken wings: sauce (single, required)
with item as (select id from public.menu_items where name = 'Chicken Wings (6)'),
g as (
  insert into public.customization_groups (menu_item_id, name, selection_type, is_required, min_select, max_select, sort_order)
  select id, 'Sauce', 'single'::public.selection_type, true, 1, 1, 0 from item
  returning id
)
insert into public.customization_options (group_id, name, price_delta, is_default, sort_order)
select g.id, o.name, 0, o.dflt, o.ord from g join (values
  ('Barbecue',    true,  0),
  ('Hot pepper',  false, 1),
  ('Honey garlic', false, 2)
) as o(name, dflt, ord) on true;

-- Burgers: make it a meal
with items as (select id from public.menu_items where name in ('Classic Beef Burger', 'Crispy Chicken Burger', 'Double Beef Burger')),
g as (
  insert into public.customization_groups (menu_item_id, name, selection_type, is_required, min_select, max_select, sort_order)
  select id, 'Make it a meal', 'single'::public.selection_type, false, 0, 1, 0 from items
  returning id
)
insert into public.customization_options (group_id, name, price_delta, is_default, sort_order)
select g.id, o.name, o.delta, false, o.ord from g join (values
  ('Fries and a soft drink',    2800, 0),
  ('Plantain and a soft drink', 2600, 1)
) as o(name, delta, ord) on true;

-- Soft drink: flavour (single, required)
with item as (select id from public.menu_items where name = 'Soft Drink'),
g as (
  insert into public.customization_groups (menu_item_id, name, selection_type, is_required, min_select, max_select, sort_order)
  select id, 'Flavour', 'single'::public.selection_type, true, 1, 1, 0 from item
  returning id
)
insert into public.customization_options (group_id, name, price_delta, is_default, sort_order)
select g.id, o.name, 0, o.dflt, o.ord from g join (values
  ('Coca-Cola', true, 0), ('Fanta', false, 1), ('Sprite', false, 2), ('Malta', false, 3)
) as o(name, dflt, ord) on true;
